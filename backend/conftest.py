# conftest.py
import pytest
from channels.layers import channel_layers

@pytest.fixture(autouse=True)
def in_memory_channel_layer(settings):
    """
    Force Django Channels to use an in-memory layer for tests.
    This prevents tests from requiring a local Redis server.
    """
    settings.CHANNEL_LAYERS = {
        "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"},
    }
    # Clear cached layers so the new settings take effect immediately
    channel_layers.backends = {}
    yield
    channel_layers.backends = {}