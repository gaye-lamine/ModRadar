#!/bin/bash

# ==============================================================================
# Script de déploiement et de Sandbox local pour ModRadar
# Conçu pour MacOS / Linux
# ==============================================================================

# Couleurs du terminal pour un feedback visuel de type NOC
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}📡  MODRADAR // DEPLOYMENT ENGINE INITIATED          ${NC}"
echo -e "${BLUE}====================================================${NC}\n"

# Arrêt immédiat du script si une commande échoue
set -e

# Vérification de présence du fichier de package pour s'assurer d'être au bon endroit
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ ERREUR : package.json introuvable dans le dossier actuel.${NC}"
    echo -e "Veuillez vous assurer d'exécuter ce script depuis la racine du projet ModRadar."
    exit 1
fi

# 1. COMPILATION & BUILD LOCAL
echo -e "${YELLOW}🔄 Étape 1/5 : Compilation locale et validation TypeScript...${NC}"
if npm run build; then
    echo -e "${GREEN}✅ Build réussi. Aucun problème de typage ou de syntaxe détecté.${NC}\n"
else
    echo -e "${RED}❌ ÉCHEC DU BUILD : Veuillez corriger les erreurs TypeScript/JSX ci-dessus.${NC}"
    exit 1
fi

# 2. AUTHENTIFICATION CLI
echo -e "${YELLOW}🔄 Étape 2/5 : Vérification de la session CLI Devvit...${NC}"
if [ -f "$HOME/.devvit/token" ]; then
    echo -e "${GREEN}✅ Session CLI active détectée ($HOME/.devvit/token). Authentification ignorée.${NC}\n"
else
    echo -e "${CYAN}Déclenchement de 'devvit login' car aucun jeton local n'a été trouvé...${NC}"
    if npx devvit login; then
        echo -e "${GREEN}✅ Authentification CLI active et opérationnelle.${NC}\n"
    else
        echo -e "${RED}❌ ERREUR : Échec de l'authentification. Veuillez vérifier vos accès Reddit.${NC}"
        exit 1
    fi
fi

# 3. TÉLÉVERSEMENT (UPLOAD)
echo -e "${YELLOW}🔄 Étape 3/5 : Téléversement du build sur les serveurs Reddit...${NC}"
if npx devvit upload; then
    echo -e "${GREEN}✅ Build téléversé et versionné sur la plateforme Devvit.${NC}\n"
else
    echo -e "${RED}❌ ERREUR : Échec de l'upload du build.${NC}"
    exit 1
fi

# 4. DÉPLOIEMENT CIBLE (INSTALLATION)
echo -e "${YELLOW}🔄 Étape 4/5 : Déploiement de ModRadar sur le subreddit Sandbox...${NC}"
echo -e "${CYAN}Installation sur 'r/ModRadarSandbox' (met à jour l'instance si déjà existante)...${NC}"
if npx devvit install ModRadarSandbox; then
    echo -e "${GREEN}✅ ModRadar déployé et actif sur r/ModRadarSandbox.${NC}\n"
else
    echo -e "${RED}❌ ERREUR : Échec de l'installation sur le subreddit sandbox. Vérifiez que r/ModRadarSandbox existe et que vous y êtes modérateur.${NC}"
    exit 1
fi

# 5. LANCEMENT DU MODE PLAY (LOCAL DEV ENVIRONMENT)
echo -e "${YELLOW}🔄 Étape 5/5 : Lancement de la sandbox interactive (devvit play)...${NC}"
echo -e "${CYAN}Cela va démarrer le serveur de développement local pour voir les posts en direct.${NC}"
echo -e "${BLUE}👉 Appuyez sur Ctrl+C pour arrêter le mode Play quand vous aurez terminé.${NC}\n"

npx devvit playtest ModRadarSandbox
