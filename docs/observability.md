# Observability

A observabilidade é uma preocupação de infraestrutura. O domínio permanece independente de NestJS e do Observe.

## Arquitetura

ObserveInstrument cria a instrumentação automática no bootstrap. O RequestContextMiddleware preserva ou gera x-request-id e devolve o mesmo identificador na resposta. O ObservableOperationInterceptor acrescenta somente atributos semânticos aprovados. A aplicação pode usar ObservabilityPort; o adapter ObserveObservabilityService delega ao TracerService.

## Configuração

Use SERVICE_ID, SERVICE_VERSION, OBSERVE_APP_KEY e OBSERVE_APP_SECRET por ambiente. Os parâmetros OBSERVE_TRACE_SAMPLE_RATE, OBSERVE_FLUSH_INTERVAL, OBSERVE_MAX_TRACES_PER_BATCH, OBSERVE_RUNTIME_METRICS e OBSERVE_FORWARD_LOGS são configuráveis. Debug só é efetivo em development.

Credenciais não devem ser commitadas. Sem credenciais válidas, o SDK não consegue enviar telemetria ao collector; isso não deve interromper a requisição.

## Requests e trace IDs

O SDK fornece o trace HTTP e usa x-request-id como identificador de correlação. O middleware garante o header de entrada e de resposta. Health endpoints existentes são ignorados para reduzir ruído.

## Atributos, PII e redaction

A política é fail-closed: apenas atributos da whitelist podem ser enviados. Segredos, credenciais, identificadores pessoais, payloads e conteúdo de documentos/imagens são proibidos. A redaction oficial do Observe permanece habilitada como defesa adicional; ela não autoriza o envio de payloads.

## Erros e logs

Erros não tratados são capturados pelo lifecycle do SDK. Erros tratados devem usar ObservabilityPort.captureHandledError com atributos seguros. Logs devem ser estruturados e não conter DTOs, bodies, headers de autorização ou PII.

## Jobs e boundaries

Não há workers, filas ou integrações externas implementados atualmente neste repositório. Quando forem adicionados, devem usar a instrumentação correspondente do bootstrap real e propagar somente traceId, entityId, operation e metadados seguros, nunca o request ou payload completo.

## Observability Rules for New Features

1. Qual operação está sendo executada?
2. Já existe auto-instrumentação suficiente?
3. É necessário um span semântico?
4. O fluxo possui erro tratado?
5. Existe integração externa?
6. Existe job?
7. O trace cruza um boundary?
8. O traceId precisa ser propagado?
9. Quais atributos são realmente necessários?
10. Existe risco de PII ou segredo?

Observabilidade não substitui auditoria nem eventos de domínio.
