package service

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/dushixiang/pika/internal/protocol"
	"github.com/dushixiang/pika/pkg/agent/collector"
	"github.com/dushixiang/pika/pkg/agent/utils"
	bolt "go.etcd.io/bbolt"
)

const (
	outboundBufferDBName    = "metrics_buffer.db"
	outboundBufferBucket    = "metrics_buffer"
	outboundBufferTimeout   = 2 * time.Second
	outboundBufferRetention = 24 * time.Hour
)

type outboundBuffer struct {
	path string
	mu   sync.Mutex
}

type bufferedMessage struct {
	Timestamp int64           `json:"ts"`
	Payload   json.RawMessage `json:"payload"`
}

func newOutboundBuffer() *outboundBuffer {
	path := filepath.Join(utils.GetSafeHomeDir(), ".pika", outboundBufferDBName)
	return &outboundBuffer{path: path}
}

func (b *outboundBuffer) Append(v interface{}) error {
	payload, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("序列化缓存消息失败: %w", err)
	}

	wrapped, err := json.Marshal(bufferedMessage{
		Timestamp: time.Now().UnixMilli(),
		Payload:   payload,
	})
	if err != nil {
		return fmt.Errorf("序列化缓存封装失败: %w", err)
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	db, err := b.openDB()
	if err != nil {
		return err
	}
	defer db.Close()

	if err := db.Update(func(tx *bolt.Tx) error {
		bucket, err := tx.CreateBucketIfNotExists([]byte(outboundBufferBucket))
		if err != nil {
			return fmt.Errorf("创建缓存桶失败: %w", err)
		}

		seq, err := bucket.NextSequence()
		if err != nil {
			return fmt.Errorf("获取缓存序列失败: %w", err)
		}

		key := make([]byte, 8)
		binary.BigEndian.PutUint64(key, seq)
		if err := bucket.Put(key, wrapped); err != nil {
			return fmt.Errorf("写入缓存失败: %w", err)
		}

		cutoff := time.Now().Add(-outboundBufferRetention).UnixMilli()
		cursor := bucket.Cursor()
		for k, v := cursor.First(); k != nil; k, v = cursor.Next() {
			var item bufferedMessage
			if err := json.Unmarshal(v, &item); err != nil || item.Timestamp == 0 {
				break
			}
			if item.Timestamp >= cutoff {
				break
			}
			if err := cursor.Delete(); err != nil {
				return fmt.Errorf("删除过期缓存失败: %w", err)
			}
		}

		return nil
	}); err != nil {
		return err
	}

	return nil
}

func (b *outboundBuffer) Flush(writer collector.WebSocketWriter) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	db, err := b.openDB()
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}
	defer db.Close()

	var (
		sent    int
		sendErr error
	)
	cutoff := time.Now().Add(-outboundBufferRetention).UnixMilli()

	if err := db.Update(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte(outboundBufferBucket))
		if bucket == nil {
			return nil
		}

		cursor := bucket.Cursor()
		for k, v := cursor.First(); k != nil; k, v = cursor.Next() {
			if sendErr != nil {
				break
			}

			var wrapped bufferedMessage
			if err := json.Unmarshal(v, &wrapped); err == nil && len(wrapped.Payload) > 0 {
				if wrapped.Timestamp > 0 && wrapped.Timestamp < cutoff {
					if err := cursor.Delete(); err != nil {
						return fmt.Errorf("删除过期缓存失败: %w", err)
					}
					continue
				}

				var msg protocol.OutboundMessage
				if err := json.Unmarshal(wrapped.Payload, &msg); err != nil {
					slog.Warn("缓存消息解析失败，已跳过", "error", err)
					if err := cursor.Delete(); err != nil {
						return fmt.Errorf("删除损坏缓存失败: %w", err)
					}
					continue
				}

				if err := writer.WriteJSON(msg); err != nil {
					sendErr = err
					break
				}

				if err := cursor.Delete(); err != nil {
					return fmt.Errorf("删除已发送缓存失败: %w", err)
				}
				sent++
				continue
			}

			var legacy protocol.OutboundMessage
			if err := json.Unmarshal(v, &legacy); err != nil {
				slog.Warn("缓存消息解析失败，已跳过", "error", err)
				if err := cursor.Delete(); err != nil {
					return fmt.Errorf("删除损坏缓存失败: %w", err)
				}
				continue
			}

			if err := writer.WriteJSON(legacy); err != nil {
				sendErr = err
				break
			}

			if err := cursor.Delete(); err != nil {
				return fmt.Errorf("删除已发送缓存失败: %w", err)
			}
			sent++
		}

		return nil
	}); err != nil {
		return sent, err
	}

	if sendErr != nil {
		return sent, sendErr
	}

	return sent, nil
}

func (b *outboundBuffer) openDB() (*bolt.DB, error) {
	if err := os.MkdirAll(filepath.Dir(b.path), 0755); err != nil {
		return nil, fmt.Errorf("创建缓存目录失败: %w", err)
	}

	db, err := bolt.Open(b.path, 0600, &bolt.Options{Timeout: outboundBufferTimeout})
	if err != nil {
		return nil, fmt.Errorf("打开缓存数据库失败: %w", err)
	}

	return db, nil
}

type outboundWriter struct {
	conn     *safeConn
	buffer   *outboundBuffer
	buffered bool
	sendErr  error
}

func newOutboundWriter(conn *safeConn, buffer *outboundBuffer) *outboundWriter {
	return &outboundWriter{
		conn:   conn,
		buffer: buffer,
	}
}

func (w *outboundWriter) WriteJSON(v interface{}) error {
	if w.conn == nil {
		if err := w.buffer.Append(v); err != nil {
			return err
		}
		w.buffered = true
		return nil
	}

	if err := w.conn.WriteJSON(v); err != nil {
		if bufferErr := w.buffer.Append(v); bufferErr != nil {
			return fmt.Errorf("写入缓存失败: %w", bufferErr)
		}
		w.buffered = true
		w.sendErr = err
		return nil
	}

	return nil
}
