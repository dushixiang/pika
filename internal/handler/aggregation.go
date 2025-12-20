package handler

import "strings"

func normalizeAggregation(raw string) (string, bool) {
	value := strings.ToLower(strings.TrimSpace(raw))
	switch value {
	case "":
		return "", true
	case "avg", "mean":
		return "avg", true
	case "max", "peak":
		return "max", true
	default:
		return "", false
	}
}
