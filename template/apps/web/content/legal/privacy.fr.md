# Politique de confidentialité

<!-- TODO : compléter chaque champ entre crochets et relire chaque section
     au regard de vos traitements réels avant la production (RGPD art. 12–14). -->

Dernière mise à jour : [date]

**Responsable de traitement** : [Raison sociale], [adresse] — contact :
[email du DPO ou contact vie privée].

## Ce que nous collectons et pourquoi

| Données | Finalité | Base légale | Conservation |
| --- | --- | --- | --- |
| Données de compte (nom, email, hash du mot de passe) | Authentification, gestion du compte | Contrat | Durée de vie du compte |
| Appartenances aux organisations et rôles | Contrôle d'accès multi-tenant | Contrat | Durée de l'appartenance |
| Projets et fichiers téléversés | Le service lui-même | Contrat | Jusqu'à suppression par vous |
| Journal d'audit (qui a fait quoi, quand) | Sécurité, traçabilité | Intérêt légitime | [durée] ; anonymisé à la suppression du compte |
| Logs serveur (IP, user agent) | Sécurité, débogage | Intérêt légitime | [durée] |
| Analyse d'usage (PostHog) | Compréhension de l'usage | **Consentement** (bandeau cookies) | [durée] |

## Cookies

- **Strictement nécessaires** (sans consentement, non désactivables) :
  cookies de session (Better-Auth), préférences de langue et de thème, et
  le cookie mémorisant votre choix de cookies.
- **Analyse (PostHog)** : déposés **uniquement après acceptation** du
  bandeau. Modifiable à tout moment via « Préférences cookies » dans le
  pied de page.

## Sous-traitants

<!-- TODO : lister vos sous-traitants réels et régions d'hébergement, et
     vérifier qu'un DPA est signé avec chacun. -->

- Hébergement : [prestataire, région]
- Envoi d'emails : [prestataire SMTP]
- Suivi d'erreurs : [Sentry — auto-hébergé ou SaaS, région]
- Analyse d'usage : [PostHog — auto-hébergé ou SaaS, région]

## Vos droits

Accès, rectification, effacement, portabilité, limitation et opposition
(RGPD art. 15–21). En libre-service dans **Paramètres** :

- **Télécharger mes données** — export JSON de tout ce qui précède.
- **Supprimer mon compte** — effacement définitif ; les entrées d'audit
  sont anonymisées, pas supprimées (traçabilité). Vous devez d'abord
  transférer toute organisation dont vous êtes l'unique propriétaire.

Pour toute autre demande : [email contact vie privée]. Vous pouvez saisir
la CNIL (<https://www.cnil.fr>).
