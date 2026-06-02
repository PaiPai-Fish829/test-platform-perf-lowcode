import importlib
import os
from pathlib import Path
from locust import LoadTestShape

from scenarios.add_location_flow import AddLocationFlowScenario
from scenarios.login_scenario import LoginScenario

from common import metrics, platform_api  # noqa: F401  # side-effect: /metrics、/platform/*

__all__ = ["AddLocationFlowScenario", "LoginScenario"]
_SHAPE_NAMES: list[str] = []


def _truthy(name: str) -> bool:
    return os.getenv(name, "0") in {"1", "true", "TRUE", "yes", "on"}


# 注册 shapes/ 下所有 LoadTestShape，供 Platform 选择 shape_class 启动。
# 参数默认值在 shapes/*.py 的 SHAPE_DEFAULTS 中维护，不在 config yaml 重复。
for shape_file in sorted(Path(__file__).parent.joinpath("shapes").glob("*.py")):
    if shape_file.name.startswith("_"):
        continue
    module = importlib.import_module(f"shapes.{shape_file.stem}")
    for attr_name in dir(module):
        obj = getattr(module, attr_name)
        if (
            isinstance(obj, type)
            and issubclass(obj, LoadTestShape)
            and obj is not LoadTestShape
            and not getattr(obj, "abstract", False)
            and attr_name not in __all__
        ):
            globals()[attr_name] = obj
            __all__.append(attr_name)
            _SHAPE_NAMES.append(attr_name)

# CLI 显式 --shape 时只保留目标策略类
if _truthy("LOCUST_ENABLE_SHAPE"):
    selected_shape = os.getenv("LOCUST_SHAPE", "stage").strip().lower()
    if selected_shape == "stage_hold":
        __all__ = [n for n in __all__ if n != "StageShape"]
    else:
        __all__ = [n for n in __all__ if n != "StageHoldShape"]
# headless 且未指定 shape：移除 Shape 类，避免 Locust 自动启用 LoadTestShape 并忽略 --run-time
elif _truthy("LOCUST_HEADLESS"):
    for name in _SHAPE_NAMES:
        globals().pop(name, None)
    __all__ = [n for n in __all__ if n not in _SHAPE_NAMES]
# dev WebUI：保留全部 Shape 供 Platform / WebUI 选择，不自动启动
