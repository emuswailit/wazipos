from rest_framework import serializers
from . import models


class EntityExpenseCategoriesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.EntityExpenseCategories
        fields = [
            'id',
            'title',
            'description',
            'is_recurrent',
            'recurrence_period',
            'created_by',
            'updated_by',
            'created',
            'updated',
        ]
        read_only_fields = ['id', 'created', 'updated']


class EntityExpensesSerializer(serializers.ModelSerializer):
    expense_category_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.EntityExpenses
        fields = [
            'id',
            'draft_id',
            'expense_category',
            'expense_category_title',
            'expense_date',
            'amount',
            'description',
            'owner',
            'created',
            'updated',
        ]
        read_only_fields = ['id', 'created', 'updated']

    def get_expense_category_title(self, obj):
        if obj.expense_category:
            return obj.expense_category.title
        return None