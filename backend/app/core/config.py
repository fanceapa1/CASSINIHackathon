from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://echoswarm:echoswarm@postgres:5432/echoswarm"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # Swarm service
    swarm_ws_url: str = "wss://tammie-unbearable-nga.ngrok-free.dev/ws/run"
    swarm_rest_url: str = "https://tammie-unbearable-nga.ngrok-free.dev"

    # Cache
    cache_ttl: int = 0
    replay_tick_delay_ms: int = 300

    # JWT
    jwt_secret: str = "change-me-before-demo"
    jwt_expiry_hours: int = 8


settings = Settings()
