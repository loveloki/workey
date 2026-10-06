package main

import (
	"log"

	"workey/internal/app"
	_ "workey/migrations"
)

func main() {
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
