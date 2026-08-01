from django.urls import path
from . import views


urlpatterns = [
    # Products urls HERE
    # path(
    #     "products",
    #     views.ProductListAPIView.as_view(),
    #     name=views.ProductListAPIView.name,
    # ),
    path("", views.productsAPIView, name="products-api-view"),
    path(
        "products/wholesalers/receipts",
        views.ProductWholesalerReceiptsListAPIView.as_view(),
        name=views.ProductWholesalerReceiptsListAPIView.name,
    ),
    path(
        "products/manufacturer",
        views.ManufacturerProductListAPIView.as_view(),
        name=views.ManufacturerProductListAPIView.name,
    ),
    path(
        "products/preparations/<uuid:pk>",
        views.ProductsByPreparationId.as_view(),
        name=views.ProductsByPreparationId.name,
    ),
    path(
        "products/categories/<uuid:pk>",
        views.ProductsByCategoryId.as_view(),
        name=views.ProductsByCategoryId.name,
    ),
    path(
        "products/<uuid:pk>",
        views.ProductDetailAPIView.as_view(),
        name=views.ProductDetailAPIView.name,
    ),
    path(
        "products/<uuid:pk>/update",
        views.ProductUpdateAPIView.as_view(),
        name=views.ProductUpdateAPIView.name,
    ),
    path(
        "products/create",
        views.ProductCreateAPIView.as_view(),
        name=views.ProductCreateAPIView.name,
    ),

    path(
        "products/<uuid:pk>/images",
        views.ProductImageList.as_view(),
        name=views.ProductImageList.name,
    ),
    path(
        "product-images/<uuid:pk>",
        views.ProductImageDetail.as_view(),
        name=views.ProductImageDetail.name,
    ),
]
