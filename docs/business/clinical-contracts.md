# Clinical Assessment Eligibility

O Clinical Worker é a autoridade para avaliações. O recorte atual persiste somente `tenantId`, `customerId`, `serviceId`, `professionalId`, `result`, `performedAt` e `validUntil` opcional.

Os resultados são exatamente `APTO`, `APTO_COM_RESTRICOES` e `NAO_APTO`. `NAO_APTO` ou avaliação vencida bloqueiam quando o Service exige avaliação. `APTO_COM_RESTRICOES` permanece elegível neste recorte porque o documento não define quais restrições impedem o serviço.

Quando `requiresAssessment=false`, Operations não chama Clinical. Quando é `true`, a comunicação deve usar Service Binding; binding ausente ou erro downstream é fail-closed.
