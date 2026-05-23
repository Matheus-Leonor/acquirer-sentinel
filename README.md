# acquirer-sentinel

A distributed event-driven pipeline that simulates real-time payment transaction processing and fraud detection across multiple acquirers — built to learn Kafka hands-on.

---

## What is this?

I work daily with SmartPOS terminals at Ipiranga Online and wanted to understand how payment systems handle high volumes of transactions in real time. So I built this over a weekend.

Three languages. Each chosen for a reason.

---

## Architecture

```
[Kotlin · Stone ]  ─┐
[Kotlin · Cielo ]  ─┼─▶  REST  ▶  [ Go Gateway ]  ▶  Kafka (transacoes-entrada)
[Kotlin · Getnet]  ─┘                                         │
                                                               ▼
                                              ┌─────────────────────────────┐
                                              │   [ Rust Antifraude · 01 ]  │  consumer group
                                              │   [ Rust Antifraude · 02 ]  │  "antifraude"
                                              └─────────────────────────────┘
                                                               │
                                                  Kafka (transacoes-resultado)
                                                               │
                                                               ▼
                                                    [ Go WebSocket ]  ──▶  Dashboard
```



---

## Services

### Kotlin Producer
Simulates three SmartPOS terminals (Stone, Cielo, Getnet) sending payment transactions via HTTP to the Go Gateway. Each terminal runs as a coroutine with a different interval — Stone every 5s, Cielo every 4s, Getnet every 3s. Around 30% of transactions are marked as fraudulent.

### Go Gateway
Receives HTTP POST requests from the Kotlin producer and publishes messages to the `transacoes-entrada` Kafka topic. Lightweight by design — its only job is ingestion.

### Rust Antifraude (×2)
Two container instances consuming from the same Kafka consumer group. Kafka automatically distributes messages between them. If one goes down, the other takes over with no message loss. Each transaction is evaluated against fraud rules and published to either `transacoes-aprovadas` or `transacoes-fraude`.

**Fraud rules:**
- `valor_alto` — transaction value above R$ 10,000
- `valor_suspeito` — exact value of R$ 9,999 (classic structuring technique)
- `sequencia` — high frequency of transactions from the same acquirer in a short window

> **Honest note:** The Kotlin producer is the one deciding if a transaction is fraud. Rust processes and routes based on that flag — it's a pipeline simulation, not an ML inference model.

### Go WebSocket
Consumes results from Kafka and pushes events to the browser via SSE (Server-Sent Events). Serves the dashboard as static files.

### Dashboard
Real-time visualization of the pipeline. Shows transactions flowing through each service, live counters for approved and fraudulent transactions, and Rust instance status.

Supports `?demo=true` mode for running without Docker.

---

## Stack

| Service | Language | Role |
|---|---|---|
| Kotlin Producer | Kotlin + Coroutines | Simulates POS terminals |
| Go Gateway | Go | HTTP ingestion → Kafka producer |
| Rust Antifraude | Rust | Kafka consumer + fraud routing |
| Go WebSocket | Go | Kafka consumer + SSE server |
| Dashboard | HTML + JS + GSAP | Real-time visualization |
| Message broker | Apache Kafka 3.7 | Event backbone |
| Orchestration | Docker Compose | All services containerized |

---

## Kafka Topics

| Topic | Producer | Consumer |
|---|---|---|
| `transacoes-entrada` | Go Gateway | Rust Antifraude (×2) |
| `transacoes-aprovadas` | Rust Antifraude | Go WebSocket |
| `transacoes-fraude` | Rust Antifraude | Go WebSocket |

---

## Running locally

**Requirements:** Docker + Docker Compose

```bash
git clone https://github.com/yourusername/acquirer-sentinel
cd acquirer-sentinel
docker compose up --build
```

Open `http://localhost:8081` to see the dashboard.

For demo mode (no Docker required after build):

```bash
open http://localhost:8081?demo=true
```

---

## What I learned

Kafka is not hard to use. It's hard to use **well**.

Understanding partitions, consumer groups, offsets, and delivery guarantees changes how you think about distributed systems entirely. The moment that stuck with me most: killing one Rust container mid-run and watching the other one absorb the load without losing a single message. That's Kafka doing exactly what it promises.

---

## Language breakdown

This project uses three languages intentionally:

**Kotlin** — the natural choice for anything POS-related. It's what I use every day building Android apps for SmartPOS terminals. Coroutines made the multi-terminal simulation clean and readable.

**Go** — chosen for the gateway and WebSocket server. Static binary, fast startup, minimal footprint. The right tool for services that just need to move data reliably.

**Rust** — chosen for the fraud service. No GC, predictable latency, and the ownership model makes concurrent message processing safe by construction. Two instances, one consumer group, zero coordination code needed.
