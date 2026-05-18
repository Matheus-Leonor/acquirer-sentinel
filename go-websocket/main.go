package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	kafka "github.com/segmentio/kafka-go"
)

type Evento struct {
	Tipo    string `json:"tipo"`
	Payload string `json:"payload"`
}

var (
	clientes   = make(map[chan string]bool)
	clientesMu sync.Mutex
)

func broadcast(msg string) {
	clientesMu.Lock()
	defer clientesMu.Unlock()
	for ch := range clientes {
		select {
		case ch <- msg:
		default:
		}
	}
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE não suportado", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	ch := make(chan string, 10)
	clientesMu.Lock()
	clientes[ch] = true
	clientesMu.Unlock()

	defer func() {
		clientesMu.Lock()
		delete(clientes, ch)
		clientesMu.Unlock()
	}()

	for {
		select {
		case msg := <-ch:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

func consumirTopico(topico string, tipo string) {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:   []string{"kafka:9092"},
		Topic:     topico,
		Partition: 0,
		MinBytes:  1,
		MaxBytes:  10e6,
	})
	defer reader.Close()
	reader.SetOffset(kafka.LastOffset)

	for {
		msg, err := reader.ReadMessage(context.Background())
		if err != nil {
			log.Printf("Erro ao ler %s: %v", topico, err)
			continue
		}

		evento := Evento{
			Tipo:    tipo,
			Payload: string(msg.Value),
		}

		json, _ := json.Marshal(evento)
		broadcast(string(json))
		log.Printf("[%s] Evento enviado pra dashboard", tipo)
	}
}

func main() {
	go consumirTopico("transacoes-entrada", "entrada")
	go consumirTopico("transacoes-aprovadas", "aprovada")
	go consumirTopico("transacoes-fraude", "fraude")

	http.HandleFunc("/eventos", wsHandler)
	http.Handle("/", http.FileServer(http.Dir("./static")))

	fmt.Println("WebSocket server rodando na porta 8081...")
	log.Fatal(http.ListenAndServe(":8081", nil))
}
