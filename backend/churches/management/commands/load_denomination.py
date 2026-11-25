"""Import a denomination's regions and parishes from a list (e.g. the one a denomination sends).

The denomination itself and its regions ship as a normal Django fixture:
    python manage.py loaddata fpfk          (churches/fixtures/fpfk.json)

Parishes come from a list file in this format, matched by name (safe to run again):
    {
      "title": "Free Pentecostal Fellowship in Kenya",
      "regions": [{"name": "Nairobi"}],                       (optional: adds missing regions)
      "parishes": [
        {"title": "FPFK Kayole", "region": "Nairobi", "town": "Nairobi", "road": "Kayole Spine Road",
         "phone": "07XXXXXXXX", "email": "", "latitude": -1.2741, "longitude": 36.9113}
      ]
    }
    python manage.py load_denomination fpfk_parishes.json --head-phone 0712345678

Each parish becomes a Church entity (authentication.Entities) of the denomination, in its
region, with its GPS location (required; rows without it are skipped and listed).
"""

import json

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Load a church denomination (regions and parishes) from a JSON file."

    def add_arguments(self, parser):
        parser.add_argument("path", help="JSON file, e.g. churches/fixtures/fpfk.json")
        parser.add_argument("--head-phone", default="", help="WaziPOS phone of the denomination's head (appointed as HEAD)")

    def handle(self, *args, **opts):
        from churches.denominations import import_denomination
        from churches.models import DenominationAdmins
        from churches.services import ChurchError, _phone, _user_for_phone

        try:
            with open(opts["path"], encoding="utf-8") as fh:
                spec = json.load(fh)
        except (OSError, ValueError) as e:
            raise CommandError(f"Could not read {opts['path']}: {e}")
        try:
            out = import_denomination(spec)
        except ChurchError as e:
            raise CommandError("; ".join(e.errors))

        if opts["head_phone"]:
            from authentication.models import Organizations

            person = _user_for_phone(_phone(opts["head_phone"]))
            if person is None:
                self.stderr.write(self.style.WARNING(f"No WaziPOS account with {opts['head_phone']}: head not appointed."))
            else:
                org = Organizations.objects.get(organization_type="DENOMINATION", title=spec["title"].upper())
                row, _ = DenominationAdmins.objects.get_or_create(organization=org, user=person, defaults={"role": "HEAD"})
                row.role, row.is_active = "HEAD", True
                row.save()
                self.stdout.write(f"Head: {person.first_name} {person.last_name}")

        self.stdout.write(self.style.SUCCESS(
            f"{out['denomination']}: {out['regions_created']} regions added, "
            f"{out['parishes_created']} parishes added, {out['parishes_existing']} parishes already there."
        ))
        for line in out["skipped"]:
            self.stderr.write(self.style.WARNING(f"Skipped: {line}"))
