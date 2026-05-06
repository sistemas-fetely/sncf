UPDATE public.frentes_investimento SET ordem = 1 WHERE nome ILIKE 'Produto';
UPDATE public.frentes_investimento SET ordem = 2 WHERE nome ILIKE 'Fetely%15%';
UPDATE public.frentes_investimento SET ordem = 3 WHERE nome ILIKE 'Marketing%';
UPDATE public.frentes_investimento SET ordem = 4 WHERE nome ILIKE '%Show%Room%';
UPDATE public.frentes_investimento SET ordem = 5 WHERE nome ILIKE 'Fábrica' OR nome ILIKE 'Fabrica';
UPDATE public.frentes_investimento SET ordem = 6 WHERE nome ILIKE 'TI%Telecom%';