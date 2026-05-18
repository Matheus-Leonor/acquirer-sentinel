package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	kafka "github.com/segmentio/kafka-go"
)

type Transacao struct {
	ID         string  `json:"id"`
	Adquirente string  `json:"adquirente"`
	Valor      float64 `json:"valor"`
	Parcelas   int     `json:"parcelas"`
	Fraude     bool    `json:"fraude"`
	TipoFraude string  `json:"tipo_fraude"`
}

var writer *kafka.Writer

func main() {
	writer = &kafka.Writer{
		Addr:        kafka.TCP("kafka:9092"),
		Topic:       "transacoes-entrada",
		Balancer:    &kafka.LeastBytes{},
		MaxAttempts: 10,
	}
	defer writer.Close()

	http.HandleFunc("/transacao", handleTransacao)
	fmt.Println("Gateway rodando na porta 8080...")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func handleTransacao(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
		return
	}

	var transacao Transacao
	if err := json.NewDecoder(r.Body).Decode(&transacao); err != nil {
		http.Error(w, "Payload inválido", http.StatusBadRequest)
		return
	}

	payload, _ := json.Marshal(transacao)

	err := writer.WriteMessages(context.Background(),
		kafka.Message{
			Key:   []byte(transacao.Adquirente),
			Value: payload,
		},
	)

	if err != nil {
		log.Printf("Erro ao publicar: %v", err)
		http.Error(w, "Erro interno", http.StatusInternalServerError)
		return
	}

	log.Printf("Transacao recebida | %s | R$ %.2f | Fraude: %v", transacao.Adquirente, transacao.Valor, transacao.Fraude)
	w.WriteHeader(http.StatusAccepted)
}