(function () {
    const currentAgreementDate = new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(new Date());

    const catalog = {
        wav: {
            key: 'wav',
            name: 'Location WAV',
            shortName: 'Location WAV',
            totalPrice: 30,
            priceSupplement: 30,
            priceLabel: '30,00 $',
            files: ['MP3', 'WAV'],
            description: 'Fichiers disponibles',
                conditions: `📄 Contrat de Licence (WAV)

        DE : STUDIO BELEC
        A : NOM DU CLIENT ICI ("Artiste")
        DATE DE L'ACCORD : ${currentAgreementDate}

        Le Producteur accorde a l'Artiste une licence non exclusive pour utiliser le beat "BEAT NAME" afin de creer un (1) morceau.

        Duree

        Valable 1 an. Renouvellement requis apres expiration.

        Limites

        * 500 ventes / telechargements
        * Streams : 200 = 1 vente
        * 1 clip video
        * Performances publiques limitees

        Droits

        * 0% royalties au Producteur
        * 50% droits d'edition pour le Producteur

        Conditions

        * Credit obligatoire : "Prod. by Studio Belec"
        * Interdiction de revendre ou partager le beat
        * Licence non transferable

        Le Producteur reste proprietaire du beat.`
        },
        'wav-stems': {
            key: 'wav-stems',
            name: 'Location de STEMS',
            shortName: 'Location de STEMS',
            totalPrice: 80,
            priceSupplement: 80,
            priceLabel: '80,00 $',
            files: ['MP3', 'WAV', 'Trackout'],
            description: 'Fichiers disponibles',
            conditions: `📄 Contrat de Licence (STEMS)

DE : STUDIO BELEC
A : NOM DU CLIENT ICI ("Artiste")
DATE DE L'ACCORD : ${currentAgreementDate}

Le Producteur accorde une licence non exclusive avec acces aux pistes separees (stems).

Duree

Valable 2 ans.

Limites

* 2 500 ventes / telechargements
* Streams illimites
* 2 clips video
* Performances publiques etendues

Droits

* 0% royalties
* 50% droits d'edition

Conditions

* Credit obligatoire
* Modification autorisee (mix/master uniquement)
* Revente du beat interdite

Le Producteur conserve tous les droits.`
        },
        'premium-stems': {
            key: 'premium-stems',
            name: 'Illimité',
            shortName: 'Illimité',
            totalPrice: 120,
            priceSupplement: 120,
            priceLabel: '120,00 $',
            files: ['MP3', 'WAV', 'Trackout'],
            description: 'Fichiers disponibles',
            conditions: `📄 Contrat de Licence (UNLIMITED)

DE : STUDIO BELEC
A : NOM DU CLIENT ICI ("Artiste")
DATE DE L'ACCORD : ${currentAgreementDate}

Le Producteur accorde une licence non exclusive illimitee pour utiliser le beat "BEAT NAME".

Duree

Illimitee.

Limites

* Ventes illimitees
* Streams illimites
* Clips illimites
* Performances illimitees

Droits

* 0% royalties
* 50% droits d'edition

Conditions

* Credit obligatoire
* Interdiction de revendre ou distribuer le beat seul

Le Producteur peut continuer a vendre le beat a d'autres artistes.`
        },
        exclusive: {
            key: 'exclusive',
            name: 'Exclusif',
            shortName: 'Exclusif',
            totalPrice: 220,
            priceSupplement: 220,
            priceLabel: '220,00 $',
            files: ['MP3', 'WAV', 'Trackout'],
            description: 'Fichiers disponibles',
            conditions: `📄 Contrat de Licence (EXCLUSIVE)

DE : STUDIO BELEC
A : NOM DU CLIENT ICI ("Artiste")
DATE DE L'ACCORD : ${currentAgreementDate}

Le Producteur accorde une licence exclusive pour le beat "BEAT NAME".

Duree

Illimitee.

Droits

* Utilisation illimitee (ventes, streams, clips, shows)
* 0% royalties
* 50% droits d'edition

Exclusivite

Le Producteur s'engage a retirer le beat de la vente et a ne plus le proposer a d'autres.

Conditions

* Credit obligatoire
* Licence non transferable

Le Producteur reste proprietaire de la composition.`
        }
    };

    function getLicenseCatalog() {
        return catalog;
    }

    function getLicenseOption(key) {
        return catalog[key] || catalog.wav;
    }

    window.licenseCatalog = catalog;
    window.getLicenseCatalog = getLicenseCatalog;
    window.getLicenseOption = getLicenseOption;
})();