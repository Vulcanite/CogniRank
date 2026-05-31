from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://interview:interview@localhost:5432/interview_platform"
    llm_provider_key: str = ""
    llm_provider_url: str = "https://openrouter.ai/api/v1"
    llm_provider_model: str = "openai/gpt-4o-mini"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    admin_username: str = "admin"
    admin_password: str = "admin123"
    admin_secret_key: str = "change-me-in-production"
    admin_token_ttl_minutes: int = 720

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
