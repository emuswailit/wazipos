from transport.transport_validators import validate_route
import datetime


def it_is_route_peak(route):
    route = validate_route(route.id)
    time_now = datetime.datetime.now().time()
    # time_now = datetime.time(8,1,0)
    if route.morning_peak_start and route.morning_peak_end:
        return time_now >=route.morning_peak_start and time_now<= route.morning_peak_end
    else:
        return False
