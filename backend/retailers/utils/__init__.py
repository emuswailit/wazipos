# retailers/utils/__init__.py
#
# Utils package. Submodules are imported explicitly at call sites:
#
#   from retailers.utils.retailer_utils import create_customer_order
#   from retailers.utils.retailer_dashboard_utils import get_user_dashboard
#
# Nothing is re-exported here on purpose: retailer_utils imports
# retailers.models, and eager re-exports risk a circular import
# the moment anything in the models package imports retailers.utils.