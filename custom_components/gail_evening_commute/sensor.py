"""Sensor platform for Gail Evening Commute."""
from __future__ import annotations
from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from .const import DOMAIN, NUM_TRAINS

SENSOR_DEFS = [("summary", "Summary", "mdi:train")]
for _i in range(1, NUM_TRAINS + 1):
    SENSOR_DEFS.append((f"train_{_i}", f"Train {_i}", "mdi:train"))

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([GailEveningSensor(coordinator, k, n, i) for k, n, i in SENSOR_DEFS])

class GailEveningSensor(CoordinatorEntity, SensorEntity):
    def __init__(self, coordinator, data_key, name, icon):
        super().__init__(coordinator)
        self._data_key = data_key
        self._attr_name = f"Gail Evening Commute {name}"
        self._attr_unique_id = f"{DOMAIN}_{data_key}"
        self._attr_icon = icon

    @property
    def _data(self):
        if not self.coordinator.data:
            return None
        return self.coordinator.data.get(self._data_key)

    @property
    def available(self) -> bool:
        return self._data is not None

    @property
    def native_value(self):
        d = self._data
        return d.get("state") if d else None

    @property
    def extra_state_attributes(self):
        d = self._data
        return {k: v for k, v in d.items() if k != "state"} if d else {}
