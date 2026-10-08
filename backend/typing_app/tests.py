import json

from datetime import timedelta

from django.test import Client, TestCase
from django.urls import reverse
from django.utils import timezone

from .models import PASSED_THRESHOLD, TextSnippet, TypingResult


class TextSnippetModelTests(TestCase):
    def test_word_count_is_computed_on_save(self):
        snippet = TextSnippet.objects.create(title='t', content='uno dos tres cuatro')
        snippet.refresh_from_db()
        self.assertEqual(snippet.word_count, 4)


class TypingResultModelTests(TestCase):
    def setUp(self):
        self.snippet = TextSnippet.objects.create(title='t', content='palabra')

    def test_passed_is_true_when_correct_words_reaches_threshold(self):
        result = TypingResult.objects.create(
            text_snippet=self.snippet,
            duration_minutes=5,
            correct_words=PASSED_THRESHOLD,
            total_words_typed=110,
            precision_percentage=90.0,
            wpm=22.0,
        )
        result.refresh_from_db()
        self.assertTrue(result.passed)

    def test_passed_is_false_below_threshold(self):
        result = TypingResult.objects.create(
            text_snippet=self.snippet,
            duration_minutes=5,
            correct_words=PASSED_THRESHOLD - 1,
            total_words_typed=100,
            precision_percentage=99.0,
            wpm=20.0,
            passed=True,
        )
        result.refresh_from_db()
        self.assertFalse(result.passed)


class RandomTextViewTests(TestCase):
    def test_returns_a_seeded_text(self):
        response = self.client.get(reverse('typing_app:random_text'))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('id', data)
        self.assertIn('content', data)
        self.assertIn('title', data)
        self.assertGreater(data['word_count'], 0)

    def test_returns_404_when_no_texts(self):
        TextSnippet.objects.all().delete()
        response = self.client.get(reverse('typing_app:random_text'))
        self.assertEqual(response.status_code, 404)

    def test_sets_csrf_cookie(self):
        response = self.client.get(reverse('typing_app:random_text'))
        self.assertIn('csrftoken', response.cookies)


class SaveResultViewTests(TestCase):
    def setUp(self):
        self.snippet = TextSnippet.objects.create(title='t', content='uno dos tres')
        self.url = reverse('typing_app:save_result')

    def post_json(self, payload, client=None):
        client = client or self.client
        return client.post(
            self.url,
            data=json.dumps(payload),
            content_type='application/json',
        )

    def test_creates_digital_result_computing_metrics(self):
        response = self.post_json({
            'mode': 'digital',
            'text_snippet': self.snippet.id,
            'text': 'uno dos tres',
            'duration_minutes': 1,
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(TypingResult.objects.count(), 1)
        data = response.json()
        self.assertEqual(data['mode'], 'digital')
        self.assertEqual(data['correct_words'], 3)
        self.assertEqual(data['total_words_typed'], 3)
        self.assertEqual(data['precision_percentage'], 100.0)
        self.assertEqual(data['wpm'], 3.0)
        self.assertEqual(data['duration_minutes'], 1)
        self.assertFalse(data['passed'])
        self.assertEqual(data['text_snippet']['id'], self.snippet.id)

    def test_digital_matches_only_by_index(self):
        response = self.post_json({
            'mode': 'digital',
            'text_snippet': self.snippet.id,
            'text': 'dos dos tres cuatro',
            'duration_seconds': 120,
        })
        data = response.json()
        self.assertEqual(data['correct_words'], 2)
        self.assertEqual(data['total_words_typed'], 4)
        self.assertAlmostEqual(data['precision_percentage'], 50.0, places=2)
        self.assertAlmostEqual(data['wpm'], 2.0, places=2)
        self.assertEqual(data['duration_minutes'], 2)

    def test_digital_respects_case_sensitive_option(self):
        default = self.post_json({
            'mode': 'digital',
            'text_snippet': self.snippet.id,
            'text': 'UNO dos tres',
            'duration_minutes': 1,
        }).json()
        self.assertEqual(default['correct_words'], 3)

        strict = self.post_json({
            'mode': 'digital',
            'text_snippet': self.snippet.id,
            'text': 'UNO dos tres',
            'duration_minutes': 1,
            'case_sensitive': True,
        }).json()
        self.assertEqual(strict['correct_words'], 2)

    def test_digital_respects_ignore_accents_option(self):
        accented = TextSnippet.objects.create(title='a', content='teoría')
        default = self.post_json({
            'mode': 'digital',
            'text_snippet': accented.id,
            'text': 'teoria',
            'duration_minutes': 1,
        }).json()
        self.assertEqual(default['correct_words'], 0)

        relaxed = self.post_json({
            'mode': 'digital',
            'text_snippet': accented.id,
            'text': 'teoria',
            'duration_minutes': 1,
            'ignore_accents': True,
        }).json()
        self.assertEqual(relaxed['correct_words'], 1)

    def test_fisico_counts_valid_spanish_words(self):
        response = self.post_json({
            'mode': 'fisico',
            'text_snippet': self.snippet.id,
            'text': 'hola, mundo! zzzxqw.',
            'duration_minutes': 1,
        })
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data['mode'], 'fisico')
        self.assertEqual(data['correct_words'], 2)
        self.assertEqual(data['total_words_typed'], 3)
        self.assertAlmostEqual(data['precision_percentage'], 66.67, places=2)
        self.assertEqual(data['wpm'], 3.0)

    def test_fisico_ignores_the_reference_text(self):
        response = self.post_json({
            'mode': 'fisico',
            'text_snippet': self.snippet.id,
            'text': 'casa perro',
            'duration_minutes': 1,
        })
        data = response.json()
        self.assertEqual(data['correct_words'], 2)
        self.assertEqual(data['total_words_typed'], 2)

    def test_fisico_accepts_legal_terms(self):
        response = self.post_json({
            'mode': 'fisico',
            'text_snippet': self.snippet.id,
            'text': 'contrato cláusula jurisprudencia',
            'duration_minutes': 1,
        })
        data = response.json()
        self.assertEqual(data['correct_words'], 3)

    def test_fisico_empty_text_is_zeros(self):
        response = self.post_json({
            'mode': 'fisico',
            'text_snippet': self.snippet.id,
            'text': '',
            'duration_minutes': 1,
        })
        data = response.json()
        self.assertEqual(data['correct_words'], 0)
        self.assertEqual(data['total_words_typed'], 0)
        self.assertEqual(data['precision_percentage'], 0.0)
        self.assertEqual(data['wpm'], 0.0)

    def test_passed_when_correct_reaches_threshold(self):
        response = self.post_json({
            'mode': 'digital',
            'text_snippet': self.snippet.id,
            'text': 'uno dos tres',
            'duration_seconds': 1,
        })
        data = response.json()
        self.assertFalse(data['passed'])

        big = TextSnippet.objects.create(
            title='big',
            content=' '.join(['derecho'] * 120),
        )
        response = self.post_json({
            'mode': 'fisico',
            'text_snippet': big.id,
            'text': ' '.join(['derecho'] * 120),
            'duration_seconds': 1,
        })
        self.assertTrue(response.json()['passed'])

    def test_rejects_missing_fields(self):
        response = self.post_json({})
        self.assertEqual(response.status_code, 400)
        errors = response.json()['errors']
        for field in ('mode', 'text_snippet', 'text', 'duration_minutes'):
            self.assertIn(field, errors)
        self.assertEqual(TypingResult.objects.count(), 0)

    def test_rejects_invalid_mode(self):
        response = self.post_json({
            'mode': 'other',
            'text_snippet': self.snippet.id,
            'text': 'hola',
            'duration_minutes': 1,
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn('mode', response.json()['errors'])

    def test_rejects_unknown_snippet(self):
        response = self.post_json({
            'mode': 'digital',
            'text_snippet': 9999,
            'text': 'hola',
            'duration_minutes': 1,
        })
        self.assertEqual(response.status_code, 404)

    def test_rejects_invalid_json(self):
        response = self.client.post(self.url, data='{no-json', content_type='application/json')
        self.assertEqual(response.status_code, 400)

    def test_requires_method_post(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)

    def test_requires_csrf_token(self):
        strict = Client(enforce_csrf_checks=True)
        response = strict.get(reverse('typing_app:random_text'))
        token = response.cookies['csrftoken'].value
        payload = {
            'mode': 'digital',
            'text_snippet': self.snippet.id,
            'text': 'uno dos tres',
            'duration_seconds': 60,
        }
        without_token = strict.post(
            self.url, data=json.dumps(payload), content_type='application/json'
        )
        self.assertEqual(without_token.status_code, 403)
        with_token = strict.post(
            self.url,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(with_token.status_code, 201)


class StatsSummaryViewTests(TestCase):
    def setUp(self):
        self.snippet = TextSnippet.objects.create(title='t', content='uno dos tres')
        self.url = reverse('typing_app:stats_summary')

    def create_result(self, wpm, precision, correct, days_ago=0):
        result = TypingResult.objects.create(
            text_snippet=self.snippet,
            duration_minutes=3,
            correct_words=correct,
            total_words_typed=100,
            precision_percentage=precision,
            wpm=wpm,
        )
        if days_ago:
            TypingResult.objects.filter(pk=result.pk).update(
                date=timezone.now() - timedelta(days=days_ago)
            )
        return result

    def test_empty_state(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['total_results'], 0)
        self.assertIsNone(data['averages']['wpm'])
        self.assertIsNone(data['best'])
        self.assertIsNone(data['max_correct_words'])
        self.assertIsNone(data['last_practice'])
        self.assertEqual(data['results'], [])

    def test_averages_best_and_counts(self):
        newest = self.create_result(wpm=40.0, precision=90.0, correct=90)
        self.create_result(wpm=55.5, precision=95.0, correct=120, days_ago=10)
        self.create_result(wpm=30.0, precision=80.0, correct=50, days_ago=120)

        data = self.client.get(self.url).json()
        self.assertEqual(data['total_results'], 3)
        self.assertEqual(data['passed_count'], 1)
        self.assertAlmostEqual(data['averages']['wpm'], 41.83, places=2)
        self.assertAlmostEqual(data['averages']['precision_percentage'], 88.33, places=2)
        self.assertEqual(data['best']['wpm'], 55.5)
        self.assertEqual(data['best_precision']['precision_percentage'], 95.0)
        self.assertEqual(data['max_correct_words'], 120)
        self.assertEqual(data['last_practice']['id'], newest.id)
        self.assertEqual(data['passed_threshold'], PASSED_THRESHOLD)

    def test_results_are_chronological_for_period(self):
        self.create_result(wpm=40.0, precision=90.0, correct=90, days_ago=45)
        recent = self.create_result(wpm=50.0, precision=95.0, correct=95, days_ago=5)
        old = self.create_result(wpm=30.0, precision=80.0, correct=80, days_ago=200)

        data = self.client.get(self.url, {'days': 30}).json()
        dates = [item['id'] for item in data['results']]
        self.assertEqual(dates, [recent.id])
        self.assertEqual(data['period']['count'], 1)
        self.assertEqual(data['period']['days'], 30)

        data_365 = self.client.get(self.url, {'days': 365}).json()
        ids = [item['id'] for item in data_365['results']]
        self.assertEqual(len(ids), 3)
        self.assertEqual(ids[0], old.id)
        self.assertEqual(ids[-1], recent.id)

    def test_rejects_invalid_period(self):
        for value in ('7', 'abc', ''):
            response = self.client.get(self.url, {'days': value})
            self.assertEqual(response.status_code, 400)
