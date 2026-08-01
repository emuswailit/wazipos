
def create_parking_station(data,user):
    errors = []

    if not "parking_station_details" in data:
        errors.append("Parking station details are required")
        parking_station = None

    if len(errors)>0:
        return errors, None
    else:
        return [], parking_station  