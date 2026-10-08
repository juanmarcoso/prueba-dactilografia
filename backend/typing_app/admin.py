from django.contrib import admin

from .models import TextSnippet, TypingResult


@admin.register(TextSnippet)
class TextSnippetAdmin(admin.ModelAdmin):
    list_display = ('title', 'word_count')
    search_fields = ('title', 'content')


@admin.register(TypingResult)
class TypingResultAdmin(admin.ModelAdmin):
    list_display = ('date', 'text_snippet', 'duration_minutes', 'wpm',
                    'precision_percentage', 'correct_words', 'passed')
    list_filter = ('passed', 'text_snippet')
    date_hierarchy = 'date'
