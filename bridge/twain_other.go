//go:build !windows

package main

import "errors"

func newTwainDSM() (twainDSM, error) {
	return nil, errors.New("TWAIN متاحٌ على ويندوز فقط")
}
