// Package ua parses user-agent strings into a small {browser, os, device}
// shape suitable for surfacing in the admin sessions UI.
package ua

import "github.com/mileusna/useragent"

type Info struct {
	Browser string `json:"browser" bson:"browser"`
	OS      string `json:"os"      bson:"os"`
	Device  string `json:"device"  bson:"device"`
	Raw     string `json:"raw"     bson:"raw"`
}

func Parse(s string) Info {
	if s == "" {
		return Info{}
	}
	p := useragent.Parse(s)
	device := "Desktop"
	switch {
	case p.Bot:
		device = "Bot"
	case p.Tablet:
		device = "Tablet"
	case p.Mobile:
		device = "Mobile"
	}
	return Info{
		Browser: p.Name,
		OS:      p.OS,
		Device:  device,
		Raw:     s,
	}
}
