# products/tasks.py

from celery import shared_task


@shared_task
def load_products(reason="task"):
    """
    Push a fresh catalogue snapshot to every connected ProductsConsumer
    (ws/products/all/). Product saves already do this automatically via
    products/signals.py; use this for manual or scheduled pushes, e.g.
    load_products.delay().
    """
    from .signals import broadcast_products_changed

    broadcast_products_changed(reason)
