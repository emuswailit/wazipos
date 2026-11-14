"""
python manage.py uppercase_category_titles [--dry-run]

Store every category title trimmed and in UPPERCASE.

Categories.save() and CategoriesQuerySet already keep new titles uppercase,
but older rows (and rows written by raw SQL or `loaddata`) can be mixed case.
`title` is unique, so rows that only differ by case ("Cereals" / "CEREALS")
are merged first:

  keeper  = the row already in the final form, else the oldest
  others  = every reference (FKs such as SubCategories.category /
            Products.category, and the Entities.categories M2M) is moved to
            the keeper, then the duplicate is deleted.

References are discovered from the model's relations, so any relation to
Categories is covered. Runs in one transaction; --dry-run reports only.
Safe to run more than once. (This is a command rather than a data
migration because migrations are generated on the server, not committed.)
"""

from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from authentication.models import Categories, normalize_category_title


class Command(BaseCommand):
    help = "Uppercase all category titles, merging categories that differ only by case."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Show what would change without saving.")

    def handle(self, *args, dry_run=False, **options):
        groups = defaultdict(list)
        for cat in Categories.objects.all().order_by("created"):
            groups[normalize_category_title(cat.title)].append(cat)

        renamed, merged = [], []
        with transaction.atomic():
            for final_title, cats in groups.items():
                if not final_title:
                    continue
                keeper = next((c for c in cats if c.title == final_title), cats[0])
                for dup in (c for c in cats if c.pk != keeper.pk):
                    merged.append((dup.title, final_title))
                    if not dry_run:
                        self._move_references(dup, keeper)
                        dup.delete()
                if keeper.title != final_title:
                    renamed.append((keeper.title, final_title))
                    if not dry_run:
                        # .update() keeps `updated` untouched; the queryset normalises the title.
                        Categories.objects.filter(pk=keeper.pk).update(title=final_title)
            if dry_run:
                transaction.set_rollback(True)

        prefix = "[dry run] " if dry_run else ""
        for old, new in renamed:
            self.stdout.write(f"{prefix}renamed  {old!r} -> {new}")
        for old, new in merged:
            self.stdout.write(f"{prefix}merged   {old!r} into {new}")
        self.stdout.write(self.style.SUCCESS(
            f"{prefix}{len(renamed)} renamed, {len(merged)} merged, {len(groups)} categories checked."
        ))

    @staticmethod
    def _move_references(dup, keeper):
        for rel in Categories._meta.related_objects:
            if rel.many_to_many:
                # e.g. Entities.categories: move links, dropping ones the keeper already has.
                through = rel.through
                to_cat = next(f for f in through._meta.fields if f.is_relation and f.related_model is Categories)
                to_other = next(f for f in through._meta.fields if f.is_relation and f.related_model is not Categories)
                already = set(
                    through.objects.filter(**{to_cat.name: keeper.pk}).values_list(to_other.attname, flat=True)
                )
                links = through.objects.filter(**{to_cat.name: dup.pk})
                links.filter(**{f"{to_other.attname}__in": already}).delete()
                links.update(**{to_cat.name: keeper.pk})
            elif rel.one_to_many or rel.one_to_one:
                # e.g. SubCategories.category, Products.category
                rel.related_model._base_manager.filter(**{rel.field.name: dup.pk}).update(**{rel.field.name: keeper.pk})
