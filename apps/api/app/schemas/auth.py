from pydantic import BaseModel, Field, model_validator


class RegisterIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=6)
    display_name: str = Field(min_length=1, max_length=120)


class LoginIn(BaseModel):
    account: str | None = Field(default=None, min_length=1, max_length=320)
    email: str | None = Field(default=None, min_length=1, max_length=320)
    password: str = Field(min_length=1)

    @model_validator(mode="after")
    def normalize_legacy_email_field(self) -> "LoginIn":
        if not self.account and self.email:
            self.account = self.email
        if not self.account:
            raise ValueError("Account is required")
        return self


class UserOut(BaseModel):
    id: str
    username: str | None = None
    email: str
    display_name: str


class AuthTokenOut(BaseModel):
    token: str
    user: UserOut


class UserUpdateIn(BaseModel):
    username: str | None = Field(default=None, max_length=50)
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
