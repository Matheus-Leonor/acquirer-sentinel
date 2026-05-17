package com.matheus.kafka

import kotlinx.coroutines.*
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.UUID
import kotlin.random.Random

data class Transacao(
    val id: String,
    val adquirente: String,
    val valor: Double,
    val parcelas: Int,
    val fraude: Boolean,
    val tipoFraude: String
)

val tiposFraude = listOf("valor_alto", "sequencia", "valor_suspeito")

fun gerarTransacao(adquirente: String): Transacao {
    val eFraude = Random.nextInt(100) < 30
    val tipoFraude = if (eFraude) tiposFraude.random() else ""

    val valor = when {
        eFraude && tipoFraude == "valor_alto" -> Random.nextDouble(10001.0, 50000.0)
        eFraude && tipoFraude == "valor_suspeito" -> 9999.0
        else -> Random.nextDouble(10.0, 5000.0)
    }

    return Transacao(
        id = UUID.randomUUID().toString(),
        adquirente = adquirente,
        valor = valor,
        parcelas = Random.nextInt(1, 12),
        fraude = eFraude,
        tipoFraude = tipoFraude
    )
}

suspend fun enviarTransacao(transacao: Transacao) {
    val json = """
        {
            "id": "${transacao.id}",
            "adquirente": "${transacao.adquirente}",
            "valor": ${transacao.valor},
            "parcelas": ${transacao.parcelas},
            "fraude": ${transacao.fraude},
            "tipo_fraude": "${transacao.tipoFraude}"
        }
    """.trimIndent()

    val client = HttpClient.newHttpClient()
    val request = HttpRequest.newBuilder()
        .uri(URI.create("http://go-gateway:8080/transacao"))
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(json))
        .build()

    repeat(10) { tentativa ->
        try {
            val response = client.send(request, HttpResponse.BodyHandlers.ofString())
            println("${transacao.adquirente} | R$ ${"%.2f".format(transacao.valor)} | Fraude: ${transacao.fraude} | Status: ${response.statusCode()}")
            return
        } catch (e: Exception) {
            println("Aguardando go-gateway... (tentativa ${tentativa + 1}): ${e.message}")
            delay(3000)
        }
    }
}

fun main(): Unit = runBlocking {
    println("Iniciando simulação dos POS...")

    launch {
        while (true) {
            enviarTransacao(gerarTransacao("stone"))
            delay(5000)
        }
    }

    launch {
        while (true) {
            enviarTransacao(gerarTransacao("cielo"))
            delay(4000)
        }
    }

    launch {
        while (true) {
            enviarTransacao(gerarTransacao("getnet"))
            delay(3000)
        }
    }
}