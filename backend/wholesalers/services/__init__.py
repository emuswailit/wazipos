# """
# Wholesaler services package.

# Re-exports the campaign services so existing call sites such as
# `from wholesalers.services import publish_campaign` keep working.
# Sub-modules can be added alongside `campaigns` without changing this
# surface.
# """

# from .campaigns import (  # noqa: F401
#     add_campaign_audience,
#     add_campaign_item,
#     close_campaign,
#     create_campaign,
#     delete_campaign,
#     delete_campaign_item,
#     opt_in_campaign,
#     opt_out_campaign,
#     project_campaign,
#     project_item_for_quantity,
#     publish_campaign,
#     remove_campaign_audience,
#     update_campaign,
#     update_campaign_item,
# )

# __all__ = [
#     "add_campaign_audience",
#     "add_campaign_item",
#     "close_campaign",
#     "create_campaign",
#     "delete_campaign",
#     "delete_campaign_item",
#     "opt_in_campaign",
#     "opt_out_campaign",
#     "project_campaign",
#     "project_item_for_quantity",
#     "publish_campaign",
#     "remove_campaign_audience",
#     "update_campaign",
#     "update_campaign_item",
# ]