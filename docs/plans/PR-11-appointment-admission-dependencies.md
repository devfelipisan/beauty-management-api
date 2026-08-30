# PR-11 — Appointment Admission Dependencies

Implementado o fundamento de Licensing co-deployed no Operations Worker, capability de admissão sem consumo de quota, restrição operacional explícita de Customer e Clinical Worker com Assessment tenant-aware.

Migration `0004_appointment_admission_dependencies.sql` adiciona `requires_assessment` e `blocked_for_new_appointments` com default `0` para preservar registros existentes, além das tabelas `licenses` e `assessments`.

O `POST /appointments` continua inexistente. A integração externa Clinical usa adapter fail-closed preparado para Service Binding, mas a validação de runtime Cloudflare permanece pendente enquanto Wrangler/D1 e bindings reais não estiverem disponíveis no ambiente.

## PR-11.1 — qualificação executada

Wrangler foi adicionado ao lock npm; as migrations 0001–0004 foram aplicadas em D1 local vazio e reaplicação retornou “No migrations to apply”. Os três configs independentes possuem dry-run `--no-bundle` funcional. O bundle padrão ainda não é qualificável porque os entrypoints Nest atuais são Node/Express e não exportam um módulo Worker Cloudflare; isso requer um próximo ajuste de runtime, sem inventar um adapter HTTP nesta etapa.
