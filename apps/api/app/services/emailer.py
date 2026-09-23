import smtplib
from dataclasses import dataclass
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.models.entities import Organization

SMTP_TIMEOUT_SECONDS = 30
SSL_PORT = 465


class EmailNotConfiguredError(Exception):
    def __init__(self) -> None:
        super().__init__("邮箱未配置,请先在设置页填写 SMTP 主机 / 账号 / 授权码和收件地址")


@dataclass
class EmailConfig:
    host: str
    port: int
    username: str
    password: str
    email_from: str
    email_to: str


def email_config_for_organization(organization: Organization) -> EmailConfig:
    if not (organization.smtp_host and organization.smtp_username and organization.smtp_password and organization.email_to):
        raise EmailNotConfiguredError()
    return EmailConfig(
        host=organization.smtp_host,
        port=organization.smtp_port or SSL_PORT,
        username=organization.smtp_username,
        password=organization.smtp_password,
        email_from=organization.email_from or organization.smtp_username,
        email_to=organization.email_to,
    )


def mask_password(password: str | None) -> str | None:
    if not password:
        return None
    if len(password) <= 4:
        return "****"
    return f"****{password[-4:]}"


def send_email(config: EmailConfig, to: str, subject: str, html_body: str, text_body: str | None = None) -> None:
    message = MIMEMultipart("alternative")
    message["Subject"] = Header(subject, "utf-8")
    message["From"] = config.email_from
    message["To"] = to
    message.attach(MIMEText(text_body or "", "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))
    if config.port == SSL_PORT:
        with smtplib.SMTP_SSL(config.host, config.port, timeout=SMTP_TIMEOUT_SECONDS) as server:
            server.login(config.username, config.password)
            server.sendmail(config.email_from, [to], message.as_string())
    else:
        with smtplib.SMTP(config.host, config.port, timeout=SMTP_TIMEOUT_SECONDS) as server:
            server.starttls()
            server.login(config.username, config.password)
            server.sendmail(config.email_from, [to], message.as_string())
