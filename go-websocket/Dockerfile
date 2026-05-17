FROM golang:1.23 AS builder
WORKDIR /app
COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o websocket .

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/websocket .
COPY static ./static
EXPOSE 8081
CMD ["./websocket"]
