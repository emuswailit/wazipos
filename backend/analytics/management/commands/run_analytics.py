# analytics/management/commands/run_analytics.py

from datetime import date, datetime, timedelta

from django.core.management.base import BaseCommand, CommandError

from analytics.services import (
    build_daily_snapshot,
    build_product_profiles,
    build_entity_metrics,
    detect_inventory_alerts,
    compute_expiry_risks,
    classify_products,
    extract_daily_demand,
    build_demand_profiles,
    build_forecasts,
    backtest_forecasts,
)


STAGES = {
    "snapshot":        build_daily_snapshot,
    "profile":         build_product_profiles,
    "metrics":         build_entity_metrics,
    "alerts":          detect_inventory_alerts,
    "expiry":          compute_expiry_risks,
    "classification":  classify_products,
    "demand_extract":  extract_daily_demand,
    "demand_profile":  build_demand_profiles,
    "forecast":        build_forecasts,
    "backtest":        backtest_forecasts,
}

PIPELINE_ORDER = [
    "snapshot", "profile", "metrics",
    "alerts", "expiry", "classification",
    "demand_extract", "demand_profile", "forecast", "backtest",
]


class Command(BaseCommand):
    help = "Run the inventory analytics pipeline."

    def add_arguments(self, parser):
        parser.add_argument(
            "--date", type=str, default=None,
            help="Single date to process (YYYY-MM-DD). Default: today.",
        )
        parser.add_argument(
            "--since", type=str, default=None,
            help="Start date for a backfill range (YYYY-MM-DD).",
        )
        parser.add_argument(
            "--until", type=str, default=None,
            help="End date for a backfill range (YYYY-MM-DD). Default: today.",
        )
        parser.add_argument(
            "--stage", type=str, default=None,
            choices=list(STAGES.keys()),
            help="Run only a single stage.",
        )
        parser.add_argument(
            "--skip", type=str, nargs="*", default=[],
            choices=list(STAGES.keys()),
            help="Skip specific stages when running the full pipeline.",
        )
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Print the plan without executing.",
        )

    def handle(self, *args, **options):
        dates = self._resolve_dates(options)

        if options["stage"]:
            stages = [options["stage"]]
        else:
            skip = set(options["skip"])
            stages = [s for s in PIPELINE_ORDER if s not in skip]

        if not stages:
            raise CommandError("No stages to run.")

        self.stdout.write(self.style.NOTICE("=" * 60))
        self.stdout.write(self.style.NOTICE("Analytics pipeline plan"))
        self.stdout.write(self.style.NOTICE("=" * 60))
        self.stdout.write(f"  Dates:  {dates[0]} → {dates[-1]} ({len(dates)} day(s))")
        self.stdout.write(f"  Stages: {', '.join(stages)}")
        self.stdout.write(f"  Dry run: {options['dry_run']}")
        self.stdout.write(self.style.NOTICE("=" * 60))
        self.stdout.write("")

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("Dry run — no changes made."))
            return

        total_start = datetime.now()
        errors = []

        for d in dates:
            self.stdout.write(self.style.MIGRATE_HEADING(f"\n▶ {d.isoformat()}"))
            for stage_name in stages:
                stage_fn = STAGES[stage_name]
                stage_start = datetime.now()
                try:
                    result = stage_fn(d)
                    elapsed = (datetime.now() - stage_start).total_seconds()
                    summary = self._format_result(result)
                    self.stdout.write(
                        f"  ✓ {stage_name:<16} ({elapsed:>6.2f}s)  {summary}"
                    )
                except Exception as exc:
                    elapsed = (datetime.now() - stage_start).total_seconds()
                    self.stdout.write(
                        self.style.ERROR(
                            f"  ✗ {stage_name:<16} ({elapsed:>6.2f}s)  {exc}"
                        )
                    )
                    errors.append((d, stage_name, str(exc)))
                    break

        total_elapsed = (datetime.now() - total_start).total_seconds()
        self.stdout.write("")
        self.stdout.write(self.style.NOTICE("=" * 60))
        self.stdout.write(self.style.SUCCESS(f"Done in {total_elapsed:.2f}s"))
        if errors:
            self.stdout.write(self.style.ERROR(f"{len(errors)} error(s) encountered:"))
            for d, stage, msg in errors:
                self.stdout.write(self.style.ERROR(f"  {d} / {stage}: {msg}"))
        self.stdout.write(self.style.NOTICE("=" * 60))

    # -----------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------

    def _resolve_dates(self, options) -> list[date]:
        if options["date"] and (options["since"] or options["until"]):
            raise CommandError("Use either --date or --since/--until, not both.")

        if options["date"]:
            return [self._parse_date(options["date"])]

        if options["since"]:
            start = self._parse_date(options["since"])
            end = (
                self._parse_date(options["until"])
                if options["until"]
                else date.today()
            )
            if end < start:
                raise CommandError("--until must be on or after --since.")
            return [
                start + timedelta(days=i)
                for i in range((end - start).days + 1)
            ]

        return [date.today()]

    def _parse_date(self, s: str) -> date:
        try:
            return datetime.strptime(s, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            raise CommandError(f"Invalid date: {s!r}. Expected YYYY-MM-DD.")

    def _format_result(self, result) -> str:
        if not isinstance(result, dict):
            return str(result)[:80]

        for key in (
            "total_rows", "profiles_created", "metrics_created",
            "lots_scored", "facts_created", "accuracies_created",
        ):
            if key in result:
                return f"{key}={result[key]}"

        if "alerts" in result:
            total = result.get("total_created", 0)
            return f"alerts_created={total}"

        items = list(result.items())[:3]
        return "  ".join(f"{k}={v}" for k, v in items)