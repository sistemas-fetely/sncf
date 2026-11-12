// PORTAO DE QUALIDADE — roda dentro do "build" e BLOQUEIA o publish.
// So bloqueia as regras de doutrina Fetely (no-restricted-syntax: ERRO CEGO +
// SISTEMA VISUAL) e react-hooks/rules-of-hooks. Todo o resto do eslint.config.js
// continua valendo no editor, mas nao trava o publish.
// Divida legada vive na CATRACA do eslint.config.js (warn = nao bloqueia).
// NAO desligar este portao, NAO trocar severidade, NAO acrescentar arquivo
// novo na catraca para fazer o build passar: corrija o codigo.
import base from "./eslint.config.js";

const PORTAO = new Set(["no-restricted-syntax", "react-hooks/rules-of-hooks"]);

export default base.map((bloco) =>
  bloco.rules
    ? {
        ...bloco,
        rules: Object.fromEntries(
          Object.entries(bloco.rules).filter(([regra]) => PORTAO.has(regra)),
        ),
      }
    : bloco,
);
