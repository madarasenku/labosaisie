-- Verrouillage de 4 fonctions d'aide internes (alerte « anon_security_definer_function_executable »).
-- À APPLIQUER D'ABORD SUR LA BASE DE TEST (ftwsxdivwoczsreiohok), puis en production sur décision de l'utilisateur.
-- Vérifié en lecture seule sur la production : aucune règle d'accès (policy) ne les utilise ;
-- elles ne sont appelées que par d'autres fonctions SECURITY DEFINER (qui s'exécutent avec les droits du propriétaire),
-- et trg_noter_maj est une fonction de déclencheur (pas besoin de droit EXECUTE pour le déclencher).
-- L'appli appelle uniquement des fonctions à p_token : aucun appel direct à ces 4 fonctions dans js/.

REVOKE EXECUTE ON FUNCTION public._compte_hors_perimetre(bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._resp_hors_perimetre(text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._username_hors_resp(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_noter_maj() FROM PUBLIC, anon, authenticated;

-- Retour arrière si besoin :
-- GRANT EXECUTE ON FUNCTION public._compte_hors_perimetre(bigint) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public._resp_hors_perimetre(text, text, text, timestamptz) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public._username_hors_resp(text) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.trg_noter_maj() TO anon, authenticated;
