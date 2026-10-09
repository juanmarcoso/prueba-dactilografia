import json
import re
import unicodedata
from datetime import timedelta

from django.db.models import Avg, Count, Max, Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

import threading

from .models import (
    MODE_DIGITAL,
    MODE_FISICO,
    PASSED_THRESHOLD,
    TextSnippet,
    TypingResult,
)

PERIOD_CHOICES = (30, 90, 365)

LEGAL_WORDS = (
    'abogado', 'acuerdo', 'alegato', 'contrato', 'cláusula', 'demanda',
    'derecho', 'documento', 'expediente', 'firmante', 'heredero', 'juez',
    'jurídico', 'jurisprudencia', 'ley', 'notario', 'obligación', 'patrimonio',
    'querella', 'recurso', 'sentencia', 'testigo', 'testamento',
    'tribunal', 'poder', 'pago', 'acta', 'normativa', 'peritaje', 'diligencias',
)


def _error(message, status=400):
    return JsonResponse({'error': message}, status=status)


def _to_number(payload, key, errors, required=False, integer=False, minimum=0):
    value = payload.get(key)
    if value is None:
        if required:
            errors[key] = 'Este campo es obligatorio.'
        return None
    try:
        number = int(value) if integer else float(value)
    except (TypeError, ValueError):
        errors[key] = 'Debe ser un número válido.'
        return None
    if number < minimum:
        errors[key] = f'Debe ser mayor o igual a {minimum}.'
        return None
    return number


def _to_bool(payload, key, default=False):
    value = payload.get(key)
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ('1', 'true', 'yes', 'on')


def _split_typed_words(text):
    trimmed = str(text or '').strip()
    if not trimmed:
        return []
    return re.split(r'\s+', trimmed)


def _clean_spanish_words(text):
    cleaned = re.sub(r'[^\w\s]', ' ', str(text or ''))
    return cleaned.split()


def _normalize_word(word, case_sensitive=False, ignore_accents=False):
    value = str(word)
    if not case_sensitive:
        value = value.lower()
    if ignore_accents:
        value = unicodedata.normalize('NFD', value)
        value = ''.join(char for char in value if unicodedata.category(char) != 'Mn')
    return value


def _tokenize_with_separators(text):
    return re.findall(r'\S+|\s+', str(text or ''))


def _extract_word(token):
    match = re.match(r'^(\S+)(.*)$', token)
    if match:
        return match.group(1), match.group(2) or ''
    return token, ''


def _normalize_word_token(word, case_sensitive=False, ignore_accents=False):
    value = str(word)
    if not case_sensitive:
        value = value.lower()
    if ignore_accents:
        value = unicodedata.normalize('NFD', value)
        value = ''.join(char for char in value if unicodedata.category(char) != 'Mn')
    return value


def _evaluate_digital(typed_text, reference_text, case_sensitive, ignore_accents):
    typed_tokens = _tokenize_with_separators(typed_text)
    reference_tokens = _tokenize_with_separators(reference_text)
    reference_words_list = [t for t in reference_tokens if t and not t.isspace()]
    normalized_reference = [
        _normalize_word_token(w, case_sensitive, ignore_accents)
        for w in reference_words_list
    ]
    evaluated = []
    ref_index = 0
    correct_count = 0
    for token in typed_tokens:
        if token and not token.isspace():
            word, trailing = _extract_word(token)
            is_correct = False
            if ref_index < len(normalized_reference):
                if _normalize_word_token(word, case_sensitive, ignore_accents) == normalized_reference[ref_index]:
                    is_correct = True
                    correct_count += 1
                ref_index += 1
            evaluated.append({'word': token, 'is_correct': is_correct})
        else:
            evaluated.append({'word': token, 'is_correct': True})
    return evaluated, correct_count, len(typed_tokens) - sum(1 for t in typed_tokens if t.isspace())


_LT = None
_LT_LOCK = threading.Lock()


def _get_lt():
    global _LT
    if _LT is None:
        with _LT_LOCK:
            if _LT is None:
                try:
                    import language_tool_python as lt
                except ImportError:
                    raise RuntimeError('La librería language_tool_python no está instalada.')
                _LT = lt.LanguageTool('es')
    return _LT

def _evaluate_fisico(typed_text):
    typed_tokens = _tokenize_with_separators(typed_text)
    lt = _get_lt()
    evaluated = []
    correct_count = 0
    total_words = 0
    if typed_text:
        try:
            matches = lt.check(typed_text)
        except Exception:
            matches = []
        offsets = []
        pos = 0
        for t in typed_tokens:
            offsets.append(pos)
            pos += len(t)
        bad = set()
        word_token_indices = []
        for i, t in enumerate(typed_tokens):
            if t and not t.isspace():
                word_token_indices.append(i)
        for mm in matches:
            cat = str(mm.category)
            rid = getattr(mm, 'rule_id', '') or ''
            is_err = (cat == 'TYPOS') or any(k in rid for k in ['AGREE', 'GRAMMAR', 'VERB', 'SUBJECT', 'PRONOUN', 'CONCORD'])
            if not is_err and rid == 'UPPERCASE_SENTENCE_START':
                for i, (t, off) in enumerate(zip(typed_tokens, offsets)):
                    if t and not t.isspace():
                        if not (off + len(t) <= mm.offset or off >= mm.offset + mm.error_length):
                            first = word_token_indices[0] if word_token_indices else -1
                            if i != first:
                                is_err = True
            if not is_err and rid in ('QUE_TILDE2',):
                is_err = True
            if is_err:
                for i, (t, off) in enumerate(zip(typed_tokens, offsets)):
                    if t and not t.isspace():
                        if not (off + len(t) <= mm.offset or off >= mm.offset + mm.error_length):
                            bad.add(i)
        for i, token in enumerate(typed_tokens):
            if token and not token.isspace() and i not in bad:
                word, trailing = _extract_word(token)
                clean = re.sub(r'[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]', '', word)
                if clean:
                    try:
                        m2 = lt.check(clean)
                        for x in m2:
                            if str(x.category) == 'TYPOS' or x.rule_id == 'MORFOLOGIK_RULE_ES':
                                bad.add(i)
                                break
                    except Exception:
                        pass
        for i, token in enumerate(typed_tokens):
            if token and not token.isspace():
                is_correct = i not in bad
                if is_correct:
                    correct_count += 1
                total_words += 1
                evaluated.append({'word': token, 'is_correct': is_correct})
            else:
                evaluated.append({'word': token, 'is_correct': True})
        return evaluated, correct_count, total_words
    else:
        return evaluated, correct_count, total_words



def _serialize_result(result):
    return {
        'id': result.id,
        'mode': result.mode,
        'date': result.date.isoformat(),
        'duration_minutes': result.duration_minutes,
        'correct_words': result.correct_words,
        'total_words_typed': result.total_words_typed,
        'precision_percentage': result.precision_percentage,
        'wpm': result.wpm,
        'passed': result.passed,
        'text_snippet': {
            'id': result.text_snippet_id,
            'title': result.text_snippet.title,
        },
    }


@require_GET
@ensure_csrf_cookie
def random_text(request):
    snippet = TextSnippet.objects.order_by('?').first()
    if snippet is None:
        return _error('No hay textos de práctica disponibles.', status=404)
    return JsonResponse({
        'id': snippet.id,
        'title': snippet.title,
        'content': snippet.content,
        'word_count': snippet.word_count,
    })


@require_POST
def save_result(request):
    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return _error('El cuerpo de la petición no es JSON válido.')

    if not isinstance(payload, dict):
        return _error('Se esperaba un objeto JSON.')

    errors = {}
    mode = payload.get('mode')
    if mode not in (MODE_DIGITAL, MODE_FISICO):
        errors['mode'] = 'Debe ser "digital" o "fisico".'

    snippet_id = _to_number(payload, 'text_snippet', errors, required=True, integer=True, minimum=1)
    duration_minutes = _to_number(payload, 'duration_minutes', errors, minimum=0)
    duration_seconds = _to_number(payload, 'duration_seconds', errors, minimum=0)

    text = payload.get('text')
    if not isinstance(text, str):
        errors['text'] = 'Debe ser el texto que escribió el usuario.'

    case_sensitive = _to_bool(payload, 'case_sensitive', False)
    ignore_accents = _to_bool(payload, 'ignore_accents', False)

    if duration_minutes is None and duration_seconds is None:
        errors['duration_minutes'] = 'Indica duration_minutes o duration_seconds.'
    elif duration_seconds is not None and duration_seconds <= 0:
        errors['duration_seconds'] = 'Debe ser mayor que 0.'
    elif duration_minutes is not None and duration_seconds is None and duration_minutes <= 0:
        errors['duration_minutes'] = 'Debe ser mayor que 0.'

    if errors:
        return JsonResponse({'errors': errors}, status=400)

    snippet = TextSnippet.objects.filter(pk=snippet_id).first()
    if snippet is None:
        return _error('El texto de práctica indicado no existe.', status=404)

    exact_minutes = duration_seconds / 60 if duration_seconds is not None else duration_minutes
    stored_minutes = max(0, round(exact_minutes))

    if mode == MODE_DIGITAL:
        evaluated, correct_words, total_words_typed = _evaluate_digital(
            text,
            snippet.content,
            case_sensitive,
            ignore_accents,
        )
    else:
        try:
            evaluated, correct_words, total_words_typed = _evaluate_fisico(text)
        except RuntimeError as exc:
            return _error(str(exc), status=500)
    precision = (correct_words / total_words_typed * 100) if total_words_typed else 0.0
    wpm = (total_words_typed / exact_minutes) if exact_minutes > 0 else 0.0

    result = TypingResult.objects.create(
        text_snippet=snippet,
        mode=mode,
        duration_minutes=stored_minutes,
        correct_words=correct_words,
        total_words_typed=total_words_typed,
        precision_percentage=round(float(precision), 2),
        wpm=round(float(wpm), 2),
    )
    response = _serialize_result(result)
    response['evaluated_text'] = evaluated
    return JsonResponse(response, status=201)


def _best_queryset(results, field):
    return results.order_by(f'-{field}', 'date').first()


def _result_brief(result):
    if result is None:
        return None
    return {
        'id': result.id,
        'mode': result.mode,
        'date': result.date.isoformat(),
        'wpm': result.wpm,
        'precision_percentage': result.precision_percentage,
        'correct_words': result.correct_words,
        'total_words_typed': result.total_words_typed,
        'duration_minutes': result.duration_minutes,
        'passed': result.passed,
        'text_snippet_title': result.text_snippet.title,
    }


@require_GET
def stats_summary(request):
    raw_days = request.GET.get('days', '30')
    try:
        days = int(raw_days)
    except (TypeError, ValueError):
        days = -1
    if days not in PERIOD_CHOICES:
        return _error('days debe ser 30, 90 o 365.')

    results = TypingResult.objects.select_related('text_snippet')
    totals = results.aggregate(
        count=Count('id'),
        passed_count=Count('id', filter=Q(passed=True)),
        avg_wpm=Avg('wpm'),
        avg_precision_percentage=Avg('precision_percentage'),
        avg_duration_minutes=Avg('duration_minutes'),
        avg_correct_words=Avg('correct_words'),
        avg_total_words_typed=Avg('total_words_typed'),
        max_wpm=Max('wpm'),
        max_precision_percentage=Max('precision_percentage'),
        max_correct_words=Max('correct_words'),
    )

    period_start = timezone.now() - timedelta(days=days)
    period_results = results.filter(date__gte=period_start).order_by('date')

    return JsonResponse({
        'total_results': totals['count'],
        'passed_count': totals['passed_count'],
        'averages': {
            'wpm': round(totals['avg_wpm'], 2) if totals['avg_wpm'] is not None else None,
            'precision_percentage': round(totals['avg_precision_percentage'], 2)
            if totals['avg_precision_percentage'] is not None else None,
            'duration_minutes': round(totals['avg_duration_minutes'], 2)
            if totals['avg_duration_minutes'] is not None else None,
            'correct_words': round(totals['avg_correct_words'], 2)
            if totals['avg_correct_words'] is not None else None,
            'total_words_typed': round(totals['avg_total_words_typed'], 2)
            if totals['avg_total_words_typed'] is not None else None,
        },
        'best': _result_brief(_best_queryset(results, 'wpm')),
        'best_precision': _result_brief(_best_queryset(results, 'precision_percentage')),
        'max_correct_words': totals['max_correct_words'],
        'last_practice': _result_brief(results.order_by('-date').first()),
        'passed_threshold': PASSED_THRESHOLD,
        'period': {
            'days': days,
            'start': period_start.isoformat(),
            'count': period_results.count(),
        },
        'results': [_serialize_result(result) for result in period_results],
    })
