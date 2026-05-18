use kafka::consumer::{Consumer, FetchOffset, GroupOffsetStorage};
use kafka::producer::{Producer, Record, RequiredAcks};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Deserialize, Serialize, Clone)]
struct Transacao {
    id: String,
    adquirente: String,
    valor: f64,
    parcelas: i32,
    fraude: bool,
    tipo_fraude: String,
}

#[derive(Debug, Serialize)]
struct ResultadoAnalise {
    transacao_id: String,
    adquirente: String,
    valor: f64,
    aprovada: bool,
    motivo: String,
    instancia: String,
}

fn verificar_fraude(t: &Transacao) -> (bool, String) {
    if t.fraude {
        return match t.tipo_fraude.as_str() {
            "valor_alto" => (true, "Valor acima do limite permitido".to_string()),
            "sequencia" => (true, "Muitas transações em sequência".to_string()),
            "valor_suspeito" => (true, "Valor suspeito detectado".to_string()),
            _ => (true, "Fraude detectada".to_string()),
        };
    }
    (false, "Aprovada".to_string())
}

fn main() {
    let instancia = std::env::var("INSTANCE_ID").unwrap_or("1".to_string());
    println!("Antifraude instancia {} iniciando...", instancia);

    let mut consumer = loop {
        match Consumer::from_hosts(vec!["kafka:9092".to_owned()])
            .with_topic("transacoes-entrada".to_owned())
            .with_group("antifraude".to_owned())
            .with_fallback_offset(FetchOffset::Earliest)
            .with_offset_storage(Some(GroupOffsetStorage::Kafka))
            .create()
        {
            Ok(c) => break c,
            Err(e) => {
                println!("Aguardando Kafka (consumer)... {}", e);
                std::thread::sleep(Duration::from_secs(3));
            }
        }
    };

    let mut producer = loop {
        match Producer::from_hosts(vec!["kafka:9092".to_owned()])
            .with_ack_timeout(Duration::from_secs(1))
            .with_required_acks(RequiredAcks::One)
            .create()
        {
            Ok(p) => break p,
            Err(e) => {
                println!("Aguardando Kafka (producer)... {}", e);
                std::thread::sleep(Duration::from_secs(3));
            }
        }
    };

    loop {
        let mss = consumer.poll().expect("Erro ao consumir");

        for ms in mss.iter() {
            for m in ms.messages() {
                let payload = std::str::from_utf8(m.value).unwrap_or("");

                if let Ok(transacao) = serde_json::from_str::<Transacao>(payload) {
                    println!(
                        "[Instancia {}] Analisando | {} | R$ {:.2}",
                        instancia, transacao.adquirente, transacao.valor
                    );

                    std::thread::sleep(Duration::from_secs(2));

                    let (e_fraude, motivo) = verificar_fraude(&transacao);

                    let resultado = ResultadoAnalise {
                        transacao_id: transacao.id.clone(),
                        adquirente: transacao.adquirente.clone(),
                        valor: transacao.valor,
                        aprovada: !e_fraude,
                        motivo,
                        instancia: instancia.clone(),
                    };

                    let topico = if e_fraude {
                        "transacoes-fraude"
                    } else {
                        "transacoes-aprovadas"
                    };

                    let payload_resultado = serde_json::to_string(&resultado).unwrap();

                    match producer.send(&Record::from_value(topico, payload_resultado.as_bytes())) {
                        Ok(offsets) => println!(
                            "[Instancia {}] {} | Aprovada: {} | topico: {} | offsets: {:?}",
                            instancia, transacao.adquirente, !e_fraude, topico, offsets
                        ),
                        Err(e) => println!(
                            "[Instancia {}] ERRO ao publicar em {}: {:?}",
                            instancia, topico, e
                        ),
                    };
                }
            }
            consumer.consume_messageset(ms).unwrap();
        }
        consumer.commit_consumed().unwrap();
    }
}