from django.db import migrations

TEXTS = [
    {
        'title': 'Una mañana de otoño en la biblioteca',
        'content': (
            'La luz de la mañana entraba por los altos ventanales y dibujaba '
            'rectángulos dorados sobre las mesas de madera. Marta acomodó su '
            'cuaderno, abrió el libro que llevaba semanas posponiendo y respiró '
            'hondo. Afuera, las hojas caían en silencio mientras el reloj de la '
            'pared marcaba el paso tranquilo de las horas. Ese día decidió que '
            'cada palabra leída sería un pequeño ladrillo de la casa que quería '
            'construir en su memoria, pieza por pieza, sin prisa pero sin pausa.'
        ),
    },
    {
        'title': 'Consejos para escribir con más velocidad',
        'content': (
            'Mejorar la velocidad al escribir no depende de mover los dedos más '
            'rápido, sino de reducir las dudas. Conviene mirar el teclado lo '
            'menos posible, mantener la espalda recta y apoyar las muñecas en '
            'una posición neutra. Practica con textos cortos durante diez '
            'minutos al día y presta atención a los errores más frecuentes. Con '
            'el tiempo, la precisión aumenta y la velocidad llega sola, como '
            'cuando aprendiste a caminar antes que a correr.'
        ),
    },
    {
        'title': 'Historia breve de los ordenadores',
        'content': (
            'Los primeros ordenadores ocupaban habitaciones enteras y apenas '
            'alcanzaban la potencia de una calculadora moderna. Con el paso de '
            'las décadas, los transistores dieron lugar a los circuitos '
            'integrados y estos a los microprocesadores. Hoy un teléfono '
            'guarda millones de veces más información que las máquinas que '
            'guiaron a las primeras naves al espacio. Cada salto tecnológico '
            'volvió la computación más cercana, hasta convertirla en una '
            'herramienta cotidiana.'
        ),
    },
    {
        'title': 'Receta sopa de verduras',
        'content': (
            'Lava y pica tres zanahorias, dos papas, una cebolla y un tallo de '
            'apio. Sofríe la cebolla en una olla con un chorrito de aceite '
            'hasta que esté transparente, añade el resto de las verduras y '
            'revuelve durante un par de minutos. Cubre con un litro de agua, '
            'agrega una hoja de laurel y cocina a fuego medio durante veinte '
            'minutos. Salpimenta al final, deja reposar un momento y sirve '
            'muy caliente con unas gotas de limón.'
        ),
    },
    {
        'title': 'El trabajo en equipo',
        'content': (
            'Un equipo funciona cuando cada integrante entiende su papel y '
            'confía en los demás. Las reuniones breves, los acuerdos claros y '
            'la costumbre de documentar las decisiones evitan malentendidos '
            'costosos. Los desacuerdos son inevitables, pero se vuelven '
            'productivos cuando se discuten las ideas y no a las personas. Al '
            'final del día, el resultado colectista siempre supera a la suma de '
            'los esfuerzos individuales.'
        ),
    },
    {
        'title': 'Notas sobre el aprendizaje',
        'content': (
            'Aprender algo nuevo exige aceptar el error como parte del '
            'camino. El cerebro fija mejor los conceptos cuando los repasa en '
            'distintos momentos y los aplica a situaciones reales. Por eso '
            'resulta más útil estudiar poco cada día que concentrar muchas '
            'horas la noche anterior al examen. Anota tus dudas, vuelve a ellas '
            'con descanso y celebra cada avance, por pequeño que parezca.'
        ),
    },
]


def seed_texts(apps, schema_editor):
    TextSnippet = apps.get_model('typing_app', 'TextSnippet')
    for item in TEXTS:
        snippet, _ = TextSnippet.objects.get_or_create(
            title=item['title'],
            defaults={'content': item['content']},
        )
        snippet.content = item['content']
        snippet.word_count = len(item['content'].split())
        snippet.save()


def remove_texts(apps, schema_editor):
    TextSnippet = apps.get_model('typing_app', 'TextSnippet')
    titles = [item['title'] for item in TEXTS]
    TextSnippet.objects.filter(title__in=titles).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('typing_app', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_texts, remove_texts),
    ]
