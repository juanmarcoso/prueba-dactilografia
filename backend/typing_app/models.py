from django.db import models

PASSED_THRESHOLD = 100

MODE_DIGITAL = 'digital'
MODE_FISICO = 'fisico'
MODE_CHOICES = [
    (MODE_DIGITAL, 'Digital'),
    (MODE_FISICO, 'Físico'),
]


class TextSnippet(models.Model):
    title = models.CharField(max_length=200)
    content = models.TextField()
    word_count = models.IntegerField(default=0)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.word_count = len(self.content.split())
        super().save(*args, **kwargs)


class TypingResult(models.Model):
    text_snippet = models.ForeignKey(
        TextSnippet,
        on_delete=models.CASCADE,
        related_name='results',
    )
    mode = models.CharField(
        max_length=10,
        choices=MODE_CHOICES,
        default=MODE_DIGITAL,
    )
    date = models.DateTimeField(auto_now_add=True)
    duration_minutes = models.IntegerField()
    correct_words = models.IntegerField()
    total_words_typed = models.IntegerField()
    precision_percentage = models.FloatField()
    wpm = models.FloatField()
    passed = models.BooleanField(default=False)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f'{self.wpm:.1f} wpm - {self.date:%Y-%m-%d %H:%M}'

    def save(self, *args, **kwargs):
        self.passed = self.correct_words >= PASSED_THRESHOLD
        super().save(*args, **kwargs)
