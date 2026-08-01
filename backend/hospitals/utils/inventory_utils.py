from ..import models
def  update_sub_store_inventory(prescription_order):
    prescription_order_items = models.PrescriptionOrderItems.objects.filter(prescription_order=prescription_order).all()
    hospital_prescription_items = models.HospitalPrescriptionItem.objects.filter(hospital_prescription=prescription_order.hospital_prescription).all()

# Key for long term term prescriptions which can be invoiced and dispensed partially
    for poi in prescription_order_items:
        for hpi in hospital_prescription_items:
            if poi.hospital_prescription_item==hpi:
               hpi.issued_unit_quantity=hpi.issued_unit_quantity+poi.issued_unit_quantity
               hpi.save()
               hpi.balance_unit_quantity=hpi.required_unit_quantity-hpi.issued_unit_quantity
               hpi.save()