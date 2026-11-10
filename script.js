import * as maplibregl from
  'https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl.mjs';

const statut = document.getElementById('statut');
const navigation = document.getElementById('navigation-escales');

const legendeInondation = document.getElementById('legende-inondation');
const legendeYonne = document.getElementById('legende-yonne');
const legendePorts = document.getElementById('legende-ports');
const legendeEstuaire = document.getElementById('legende-estuaire');

const mouvementReduit = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

// Cadrages des six escales.
const niveauxZoom = {
  1: 11,
  2: 10,
  3: 12,
  4: 10,
  5: 10,
  6: 9
};

// Création du fond de carte.
const carte = new maplibregl.Map({
  container: 'carte',
  center: [2.5, 48.6],
  zoom: 6,

  style: {
    version: 8,

    sources: {
      openstreetmap: {
        type: 'raster',
        tiles: [
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }
    },

    layers: [
      {
        id: 'fond',
        type: 'raster',
        source: 'openstreetmap'
      }
    ]
  }
});

// Boutons de zoom et boussole.
carte.addControl(
  new maplibregl.NavigationControl(),
  'top-right'
);

// Échelle graphique.
carte.addControl(
  new maplibregl.ScaleControl({ unit: 'metric' }),
  'bottom-left'
);

// Chargement d’un fichier depuis le dossier donnees.
async function chargerGeoJSON(nom) {
  const reponse = await fetch(`donnees/${nom}.geojson`);

  if (!reponse.ok) {
    throw new Error(
      `Impossible de charger ${nom}.geojson : ${reponse.status}`
    );
  }

  const donnees = await reponse.json();

  if (
    donnees.type !== 'FeatureCollection' ||
    !Array.isArray(donnees.features)
  ) {
    throw new Error(
      `${nom}.geojson ne contient pas une collection GeoJSON valide.`
    );
  }

  return donnees;
}

// Ajout des couches une fois le fond prêt.
carte.on('load', async () => {
  try {
    const [seine, affluents, escales, inondation, ports, estuaire] =
      await Promise.all([
        chargerGeoJSON('seine'),
        chargerGeoJSON('affluents'),
        chargerGeoJSON('escales'),
        chargerGeoJSON('inondation_troyes_moyen_web'),
        chargerGeoJSON('ports_paris'),
        chargerGeoJSON('estuaire_seine')
      ]);

    // 1. Masses d’eau de transition de l’estuaire.
    carte.addSource('estuaire', {
      type: 'geojson',
      data: estuaire
    });

    const couleursEstuaire = [
      'match',
      ['get', 'CdMasseDEau'],
      'HT01', '#218c74',
      'HT02', '#168aad',
      'HT03', '#6654b8',
      '#999999'
    ];

    carte.addLayer({
      id: 'estuaire-surfaces',
      type: 'fill',
      source: 'estuaire',

      layout: {
        visibility: 'none'
      },

      paint: {
        'fill-color': couleursEstuaire,
        'fill-opacity': 0.55,
        'fill-outline-color': couleursEstuaire
      }
    });

    // 2. Surfaces inondables de Troyes.
    carte.addSource('inondation-troyes', {
      type: 'geojson',
      data: inondation
    });

    carte.addLayer({
      id: 'inondation-troyes-surface',
      type: 'fill',
      source: 'inondation-troyes',

      layout: {
        visibility: 'none'
      },

      paint: {
        'fill-color': '#7740b5',
        'fill-opacity': 0.6,
        'fill-outline-color': '#542080'
      }
    });

    // 3. Affluents.
    carte.addSource('affluents', {
      type: 'geojson',
      data: affluents
    });

    carte.addLayer({
      id: 'affluents-lignes',
      type: 'line',
      source: 'affluents',

      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },

      paint: {
        'line-color': '#58a6cf',
        'line-width': 2
      }
    });

    // 4. Cours principal de la Seine.
    carte.addSource('seine', {
      type: 'geojson',
      data: seine
    });

    carte.addLayer({
      id: 'seine-ligne',
      type: 'line',
      source: 'seine',

      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },

      paint: {
        'line-color': '#164eaa',
        'line-width': 3.5
      }
    });

    // 5. Surlignage de l’Yonne au chapitre de Montereau.
    carte.addLayer({
      id: 'yonne-confluence',
      type: 'line',
      source: 'affluents',

      filter: [
        'in',
        'yonne',
        [
          'downcase',
          ['to-string', ['coalesce', ['get', 'TopoOH'], '']]
        ]
      ],

      layout: {
        visibility: 'none',
        'line-cap': 'round',
        'line-join': 'round'
      },

      paint: {
        'line-color': '#bf5b17',
        'line-width': 4
      }
    });

    // 6. Points des escales.
    carte.addSource('escales', {
      type: 'geojson',
      data: escales
    });

    carte.addLayer({
      id: 'escales-points',
      type: 'circle',
      source: 'escales',

      paint: {
        'circle-radius': 7,
        'circle-color': '#e49429',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2
      }
    });

    // 7. Repères portuaires du chapitre de Paris.
    carte.addSource('ports-paris', {
      type: 'geojson',
      data: ports
    });

    carte.addLayer({
      id: 'ports-paris-points',
      type: 'circle',
      source: 'ports-paris',

      layout: {
        visibility: 'none'
      },

      paint: {
        'circle-radius': 8,
        'circle-color': '#18754a',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2
      }
    });

    // Tri des escales selon le champ ordre.
    const escalesTriees = [...escales.features]
      .filter(escale => escale.geometry?.type === 'Point')
      .sort((a, b) =>
        Number(a.properties.ordre) - Number(b.properties.ordre)
      );

    // Vue d’ensemble au chargement.
    const emprise = new maplibregl.LngLatBounds();

    for (const escale of escalesTriees) {
      emprise.extend(
        escale.geometry.coordinates.slice(0, 2)
      );
    }

    if (!emprise.isEmpty()) {
      carte.fitBounds(emprise, {
        padding: 40,
        maxZoom: 8,
        duration: 0
      });
    }

    // Une seule fenêtre d’information ouverte à la fois.
    const popup = new maplibregl.Popup();

    const chapitres = [
      ...document.querySelectorAll('.chapitre')
    ];

    const boutons = new Map();

    const escalesParOrdre = new Map(
      escalesTriees.map(escale => [
        Number(escale.properties.ordre),
        escale
      ])
    );

    let ordreActif = null;

    // Actualisation de la carte selon le chapitre lu.
    function activerEscale(ordre) {
      const escale = escalesParOrdre.get(ordre);

      if (!escale || ordre === ordreActif) {
        return;
      }

      ordreActif = ordre;

      // Surfaces inondables à Troyes uniquement.
      carte.setLayoutProperty(
        'inondation-troyes-surface',
        'visibility',
        ordre === 2 ? 'visible' : 'none'
      );

      legendeInondation.hidden = ordre !== 2;

      // Yonne surlignée à Montereau uniquement.
      carte.setLayoutProperty(
        'yonne-confluence',
        'visibility',
        ordre === 3 ? 'visible' : 'none'
      );

      legendeYonne.hidden = ordre !== 3;

      // Ports visibles à Paris uniquement.
      carte.setLayoutProperty(
        'ports-paris-points',
        'visibility',
        ordre === 4 ? 'visible' : 'none'
      );

      legendePorts.hidden = ordre !== 4;

      // Masses d’eau visibles à Rouen et à Honfleur.
      const afficherEstuaire = ordre === 5 || ordre === 6;

      carte.setLayoutProperty(
        'estuaire-surfaces',
        'visibility',
        afficherEstuaire ? 'visible' : 'none'
      );

      legendeEstuaire.hidden = !afficherEstuaire;

      // Mise en évidence du bouton actif.
      boutons.forEach((bouton, numero) => {
        bouton.setAttribute(
          'aria-pressed',
          String(numero === ordre)
        );
      });

      // Mise en évidence du chapitre actif.
      chapitres.forEach(chapitre => {
        chapitre.classList.toggle(
          'actif',
          Number(chapitre.dataset.ordre) === ordre
        );
      });

      popup.remove();

      carte.flyTo({
        center: escale.geometry.coordinates.slice(0, 2),
        zoom: niveauxZoom[ordre] || 10,
        duration: mouvementReduit ? 0 : 1200
      });

      const nom = escale.properties.nom || 'Escale';
      const theme = escale.properties.theme || '';

      statut.textContent =
        theme ? `${nom} — ${theme}` : nom;
    }

    // Création des boutons conduisant aux chapitres.
    for (const escale of escalesTriees) {
      const ordre = Number(escale.properties.ordre);
      const bouton = document.createElement('button');

      bouton.type = 'button';
      bouton.textContent =
        `${ordre}. ${escale.properties.nom}`;

      bouton.setAttribute('aria-pressed', 'false');

      bouton.addEventListener('click', () => {
        const chapitre = document.getElementById(
          `chapitre-${ordre}`
        );

        if (chapitre) {
          chapitre.scrollIntoView({
            behavior: mouvementReduit ? 'instant' : 'smooth',
            block: 'start'
          });
        }
      });

      boutons.set(ordre, bouton);
      navigation.appendChild(bouton);
    }

    // Détection du chapitre dans la zone de lecture.
    function synchroniserRecit() {
      const petitEcran = window.matchMedia(
        '(max-width: 800px)'
      ).matches;

      const ligneLecture = window.innerHeight *
        (petitEcran ? 0.70 : 0.50);

      for (const chapitre of chapitres) {
        const position = chapitre.getBoundingClientRect();

        if (
          position.top <= ligneLecture &&
          position.bottom > ligneLecture
        ) {
          activerEscale(
            Number(chapitre.dataset.ordre)
          );

          break;
        }
      }
    }

    // Limitation des calculs pendant le défilement.
    let synchronisationPrevue = false;

    window.addEventListener('scroll', () => {
      if (synchronisationPrevue) {
        return;
      }

      synchronisationPrevue = true;

      window.requestAnimationFrame(() => {
        synchroniserRecit();
        synchronisationPrevue = false;
      });
    }, { passive: true });

    // Adaptation aux changements de taille de fenêtre.
    window.addEventListener('resize', () => {
      carte.resize();
      synchroniserRecit();
    });

    // Informations au clic sur une escale.
    carte.on('click', 'escales-points', evenement => {
      const escale = evenement.features?.[0];

      if (!escale || escale.geometry.type !== 'Point') {
        return;
      }

      const nom = escale.properties.nom || 'Escale';
      const theme = escale.properties.theme || '';

      popup
        .setLngLat(
          escale.geometry.coordinates.slice(0, 2)
        )
        .setText(
          theme ? `${nom} — ${theme}` : nom
        )
        .addTo(carte);
    });

    // Informations au clic sur un port.
    carte.on('click', 'ports-paris-points', evenement => {
      const port = evenement.features?.[0];

      if (!port || port.geometry.type !== 'Point') {
        return;
      }

      const nom = port.properties.nom || 'Port';
      const coursEau = port.properties.cours_eau || '';

      const texte = coursEau
        ? `${nom} — ${coursEau}. Repère indicatif du site portuaire.`
        : `${nom}. Repère indicatif du site portuaire.`;

      popup
        .setLngLat(
          port.geometry.coordinates.slice(0, 2)
        )
        .setText(texte)
        .addTo(carte);
    });

    // Informations au clic sur une masse d’eau.
    carte.on('click', 'estuaire-surfaces', evenement => {
      // Priorité aux points lorsqu’ils recouvrent une surface.
      const points = carte.queryRenderedFeatures(
        evenement.point,
        {
          layers: [
            'escales-points',
            'ports-paris-points'
          ]
        }
      );

      if (points.length > 0) {
        return;
      }

      const secteur = evenement.features?.[0];

      if (!secteur) {
        return;
      }

      const code = secteur.properties.CdMasseDEau || '';
      const nom =
        secteur.properties.NomMasseDEau || 'Masse d’eau';

      popup
        .setLngLat(evenement.lngLat)
        .setText(
          `${code} — ${nom}. Référentiel Sandre, rapportage 2022.`
        )
        .addTo(carte);
    });

    // Curseur indiquant les éléments cliquables.
    for (const couche of [
      'escales-points',
      'ports-paris-points',
      'estuaire-surfaces'
    ]) {
      carte.on('mouseenter', couche, () => {
        carte.getCanvas().style.cursor = 'pointer';
      });

      carte.on('mouseleave', couche, () => {
        carte.getCanvas().style.cursor = '';
      });
    }

    statut.textContent =
      'Fais défiler le récit ou choisis une escale avec les boutons.';

    // Synchronisation si la page est déjà partiellement défilée.
    synchroniserRecit();

  } catch (erreur) {
    console.error(erreur);

    statut.textContent =
      'Erreur : ' + erreur.message +
      ' Vérifie les fichiers du dossier web/donnees.';
  }
});