# Error Model

```json
{"code":"APPOINTMENT_TIME_CONFLICT","message":"Horário indisponível","requestId":"...","correlationId":"..."}
```

Mapeamento: `NOT_FOUND` 404, `FORBIDDEN` 403, `CONFLICT` 409, `VALIDATION` 422, `RATE_LIMIT` 429, `INFRASTRUCTURE` 503 e `UNEXPECTED` 500. Frontend usa `code`, nunca parsing de texto.

