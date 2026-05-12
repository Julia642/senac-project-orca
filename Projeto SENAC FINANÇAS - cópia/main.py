#!/usr/bin/env python3
"""Servidor local do Orça com API de recuperação de senha."""

from __future__ import annotations

import json
import os
import secrets
import smtplib
import ssl
import time
from dataclasses import dataclass
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import quote, urlparse

BASE_DIR = Path(__file__).resolve().parent
RESET_TOKEN_TTL_SECONDS = 30 * 60
RESET_TOKENS: dict[str, dict[str, float | str]] = {}


def load_env_file(path: Path) -> None:
    """Carrega variáveis KEY=VALUE de um arquivo .env sem dependências externas."""
    if not path.exists():
        return

    try:
        raw_text = path.read_text(encoding="utf-8")
    except OSError:
        return

    for raw_line in raw_text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue

        normalized = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, normalized)


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class EmailSettings:
    host: str
    port: int
    username: str
    password: str
    sender: str
    use_tls: bool
    use_ssl: bool
    app_base_url: str

    @classmethod
    def from_env(cls) -> "EmailSettings":
        host = os.getenv("ORCA_SMTP_HOST", "").strip()

        try:
            port = int(os.getenv("ORCA_SMTP_PORT", "587"))
        except ValueError:
            port = 587

        username = os.getenv("ORCA_SMTP_USER", "").strip()
        password = os.getenv("ORCA_SMTP_PASSWORD", "").strip()
        sender = os.getenv("ORCA_SMTP_FROM", "").strip() or username
        use_tls = env_bool("ORCA_SMTP_USE_TLS", True)
        use_ssl = env_bool("ORCA_SMTP_USE_SSL", False)
        app_base_url = os.getenv("ORCA_APP_BASE_URL", "http://127.0.0.1:8080").rstrip("/")

        return cls(
            host=host,
            port=port,
            username=username,
            password=password,
            sender=sender,
            use_tls=use_tls,
            use_ssl=use_ssl,
            app_base_url=app_base_url,
        )

    def is_configured(self) -> bool:
        return bool(self.host and self.port and self.sender)


load_env_file(BASE_DIR / ".env")
EMAIL_SETTINGS = EmailSettings.from_env()


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def create_reset_token(email: str) -> str:
    clear_expired_tokens()

    token = secrets.token_urlsafe(32)
    RESET_TOKENS[token] = {
        "email": normalize_email(email),
        "expires_at": time.time() + RESET_TOKEN_TTL_SECONDS,
    }
    return token


def clear_expired_tokens() -> None:
    now = time.time()
    expired = [token for token, data in RESET_TOKENS.items() if float(data["expires_at"]) <= now]
    for token in expired:
        RESET_TOKENS.pop(token, None)


def consume_reset_token(token: str, email: str) -> tuple[bool, str]:
    clear_expired_tokens()

    token_data = RESET_TOKENS.get(token)
    if not token_data:
        return False, "Este link de recuperação é inválido ou já expirou."

    expected_email = str(token_data["email"])
    if normalize_email(email) != expected_email:
        return False, "O e-mail informado não corresponde ao link de recuperação."

    RESET_TOKENS.pop(token, None)
    return True, "Token válido."


def send_email_message(message: EmailMessage) -> tuple[bool, str]:
    try:
        context = ssl.create_default_context()

        if EMAIL_SETTINGS.use_ssl:
            with smtplib.SMTP_SSL(
                EMAIL_SETTINGS.host,
                EMAIL_SETTINGS.port,
                timeout=20,
                context=context,
            ) as server:
                if EMAIL_SETTINGS.username and EMAIL_SETTINGS.password:
                    server.login(EMAIL_SETTINGS.username, EMAIL_SETTINGS.password)
                server.send_message(message)
        else:
            with smtplib.SMTP(EMAIL_SETTINGS.host, EMAIL_SETTINGS.port, timeout=20) as server:
                server.ehlo()
                if EMAIL_SETTINGS.use_tls:
                    server.starttls(context=context)
                    server.ehlo()
                if EMAIL_SETTINGS.username and EMAIL_SETTINGS.password:
                    server.login(EMAIL_SETTINGS.username, EMAIL_SETTINGS.password)
                server.send_message(message)

    except Exception as exc:
        return False, f"Falha ao enviar e-mail: {exc}"

    return True, "E-mail enviado com sucesso."


def send_reset_email(recipient: str, token: str) -> tuple[bool, str]:
    if not EMAIL_SETTINGS.is_configured():
        return (
            False,
            "Serviço de e-mail não configurado. Defina ORCA_SMTP_HOST, ORCA_SMTP_PORT, "
            "ORCA_SMTP_USER, ORCA_SMTP_PASSWORD e ORCA_SMTP_FROM no .env.",
        )

    reset_link = (
        f"{EMAIL_SETTINGS.app_base_url}/index.html"
        f"?reset_token={quote(token, safe='')}&email={quote(recipient, safe='')}"
    )

    body = (
        "Olá!\n\n"
        "Recebemos uma solicitação para redefinir a senha da sua conta no Orça.\n"
        "Para continuar, clique no link abaixo:\n\n"
        f"{reset_link}\n\n"
        "Este link expira em 30 minutos e só pode ser usado uma vez.\n"
        "Se você não solicitou essa redefinição, ignore este e-mail.\n\n"
        "Equipe Orça"
    )

    message = EmailMessage()
    message["Subject"] = "Redefinição de senha do Orça"
    message["From"] = EMAIL_SETTINGS.sender
    message["To"] = recipient
    message.set_content(body)

    sent, error_message = send_email_message(message)
    if not sent:
        return False, error_message
    return True, "E-mail de recuperação enviado com sucesso."


def send_account_change_email(old_email: str, new_email: str) -> tuple[bool, str]:
    if not EMAIL_SETTINGS.is_configured():
        return (
            False,
            "Serviço de e-mail não configurado. Defina ORCA_SMTP_HOST, ORCA_SMTP_PORT, "
            "ORCA_SMTP_USER, ORCA_SMTP_PASSWORD e ORCA_SMTP_FROM no .env.",
        )

    old_normalized = normalize_email(old_email)
    new_normalized = normalize_email(new_email)
    recipients = [new_normalized]

    if old_normalized and old_normalized != new_normalized:
        recipients.append(old_normalized)

    body = (
        "Olá!\n\n"
        "O usuário da sua conta no Orça fez uma alteração nos dados de login "
        "(e-mail e/ou senha).\n"
        "As informações foram atualizadas com sucesso.\n\n"
        f"E-mail anterior: {old_email}\n"
        f"Novo e-mail: {new_email}\n\n"
        "Se você não reconhece essa alteração, altere sua senha imediatamente e entre em contato com o suporte.\n\n"
        "Equipe Orça"
    )

    for recipient in recipients:
        message = EmailMessage()
        message["Subject"] = "Confirmação de alteração da conta no Orça"
        message["From"] = EMAIL_SETTINGS.sender
        message["To"] = recipient
        message.set_content(body)

        sent, error_message = send_email_message(message)
        if not sent:
            return False, error_message

    return True, "E-mail de confirmação enviado com sucesso."


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path in {"/", "/index.html"}:
            return self._serve_file("index.html", "text/html; charset=utf-8")

        if path == "/styles.css":
            return self._serve_file("styles.css", "text/css; charset=utf-8")

        if path == "/app.js":
            return self._serve_file("app.js", "application/javascript; charset=utf-8")

        if path.startswith("/Icones/"):
            return self._serve_file(path.lstrip("/"), "image/png")

        self.send_response(404)
        self.end_headers()
        self.wfile.write(b"Not found")

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/forgot-password":
            return self._handle_forgot_password()

        if path == "/api/reset-password":
            return self._handle_reset_password()

        if path == "/api/account-change-notification":
            return self._handle_account_change_notification()

        self._send_json(404, {"message": "Rota não encontrada."})

    def _handle_forgot_password(self) -> None:
        payload = self._read_json_body()
        if payload is None:
            return self._send_json(400, {"message": "Corpo da requisição inválido."})

        email = str(payload.get("email", "")).strip()
        if not email or "@" not in email:
            return self._send_json(400, {"message": "Informe um e-mail válido."})

        token = create_reset_token(email)
        sent, message = send_reset_email(email, token)

        if not sent:
            RESET_TOKENS.pop(token, None)
            return self._send_json(503, {"message": message})

        return self._send_json(
            200,
            {
                "message": (
                    "Se o e-mail estiver cadastrado, você receberá uma mensagem do Orça "
                    "para redefinir sua senha."
                )
            },
        )

    def _handle_reset_password(self) -> None:
        payload = self._read_json_body()
        if payload is None:
            return self._send_json(400, {"message": "Corpo da requisição inválido."})

        token = str(payload.get("token", "")).strip()
        email = str(payload.get("email", "")).strip()

        if not token or not email:
            return self._send_json(400, {"message": "Token e e-mail são obrigatórios."})

        is_valid, message = consume_reset_token(token, email)
        if not is_valid:
            return self._send_json(400, {"message": message})

        return self._send_json(200, {"message": "Token de recuperação validado com sucesso."})

    def _handle_account_change_notification(self) -> None:
        payload = self._read_json_body()
        if payload is None:
            return self._send_json(400, {"message": "Corpo da requisição inválido."})

        old_email = str(payload.get("old_email", "")).strip()
        new_email = str(payload.get("new_email", "")).strip()

        if not old_email or "@" not in old_email:
            return self._send_json(400, {"message": "Informe um e-mail antigo válido."})

        if not new_email or "@" not in new_email:
            return self._send_json(400, {"message": "Informe um novo e-mail válido."})

        sent, message = send_account_change_email(old_email, new_email)
        if not sent:
            return self._send_json(503, {"message": message})

        return self._send_json(200, {"message": "E-mail de confirmação enviado com sucesso."})

    def _read_json_body(self) -> dict | None:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None

        if content_length <= 0:
            return {}

        raw_body = self.rfile.read(content_length)
        if not raw_body:
            return {}

        try:
            return json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            return None

    def _send_json(self, status: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _serve_file(self, filename: str, content_type: str) -> None:
        target = BASE_DIR / filename
        if not target.exists():
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"File not found")
            return

        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    host = "127.0.0.1"
    port = 8080
    print(f"Abrindo em http://{host}:{port}")
    HTTPServer((host, port), Handler).serve_forever()
