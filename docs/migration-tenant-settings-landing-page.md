# Tenant settings and landing page extraction

This slice moves tenant settings and landing-page business ownership from `beauty-management-web` to `beauty-management-api`.

Authoritative endpoints:

- `GET /v1/tenant/settings`
- `PUT /v1/tenant/settings`
- `GET /v1/tenant/landing-page`
- `PUT /v1/tenant/landing-page/draft`
- `POST /v1/tenant/landing-page/publish`
- `POST /v1/tenant/landing-page/hide`

The web repository remains responsible only for presentation contracts, HTTP gateway/BFF transport and UI validation. Backend validation, RBAC, state transitions and database schema live in this repository.
