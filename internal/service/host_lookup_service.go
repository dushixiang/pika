package service

import (
	"bufio"
	"net"
	"os"
	"strings"

	"go.uber.org/zap"
)

type HostLookupService struct {
	logger *zap.Logger
	hosts  map[string]string // ip -> hostname
}

func NewHostLookupService(logger *zap.Logger) *HostLookupService {
	svc := &HostLookupService{logger: logger, hosts: make(map[string]string)}
	svc.loadHostsFile("/etc/hosts")
	return svc
}

func (s *HostLookupService) loadHostsFile(path string) {
	f, err := os.Open(path)
	if err != nil {
		s.logger.Error("failed to open hosts file", zap.Error(err))
		return
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		ip := fields[0]
		hostname := fields[1]
		s.hosts[ip] = hostname
	}
	if err := scanner.Err(); err != nil {
		s.logger.Error("error reading hosts file", zap.Error(err))
	}
}

// Lookup first checks the hosts map, then falls back to DNS PTR lookup.
func (s *HostLookupService) Lookup(ip string) string {
	if host, ok := s.hosts[ip]; ok {
		return host
	}
	names, err := net.LookupAddr(ip)
	if err != nil || len(names) == 0 {
		return ""
	}
	// Trim trailing dot from PTR result.
	return strings.TrimSuffix(names[0], ".")
}
