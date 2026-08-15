# Medição CT-e — 2026-08-15

Fonte: bucket `nfs-stage` (Storage API, service-role, paginado). Somente leitura.

## Passo 1 e 2 — Inventário

| métrica | valor |
|---|---|
| objetos no bucket | 1450 |
| arquivos com chave modelo 57 (CT-e) | 177 |
| chaves únicas de 44 dígitos | 96 |
| arquivos duplicados (mesma chave) | 81 |
| chaves com XML baixado e parseado | 88 |
| chaves sem XML disponível (só PDF/binário sob extensão .xml) | 8 |

Chaves sem XML (não analisadas):

- `31260503007331013715570010088675161686592430`
- `35260503007331008045570010100994551713760850`
- `35260503007331008045570010112362251300072521`
- `35260503007331017540570010378476281451576989`
- `35260503007331020258570010031778761572852880`
- `35260548740351011523570000071774561347751454`
- `42260503007331021653570010187721101840882438`
- `42260503007331021653570010207779061746772354`

Transportadoras identificadas pelo CNPJ do emitente (dígitos 7–20 da chave):

| transportadora | CT-e analisados |
|---|---|
| 07906565000181 · SJB EXPRESS TRANSPORTES LTDA | 1 |
| 81560047000705 · ACEVILLE TRANSPORTES LTDA | 1 |
| BRASPRESS | 18 |
| ICARO | 68 |

## A — Componentes (`<Comp><xNome>`)

### 07906565000181 · SJB EXPRESS TRANSPORTES LTDA

| xNome | CT-e em que aparece | soma vComp |
|---|---|---|
| `FRETE PESO` | 1 | 275.00 |

### 81560047000705 · ACEVILLE TRANSPORTES LTDA

| xNome | CT-e em que aparece | soma vComp |
|---|---|---|
| `FRETE PESO` | 1 | 379.65 |
| `FRETE VALOR` | 1 | 53.02 |
| `DESPACHO` | 1 | 10.00 |
| `GRIS` | 1 | 15.15 |
| `PEDAGIO` | 1 | 50.40 |
| `TAS` | 1 | 3.65 |
| `ADICIONAL FRETE` | 1 | 32.53 |
| `POS` | 1 | 30.30 |
| `IMP REPASSADO` | 1 | 78.37 |

### BRASPRESS

| xNome | CT-e em que aparece | soma vComp |
|---|---|---|
| `FRETE VALOR` | 18 | 652.82 |
| `PEDAGIO` | 18 | 111.37 |
| `SEC/CAT` | 18 | 27.68 |
| `ADEME` | 18 | 197.85 |
| `FRETE PESO` | 18 | 3720.58 |
| `OUTRAS` | 14 | 768.05 |
| `LIBERACAO SEFAZ` | 8 | 26.10 |
| `DESPACHO` | 2 | 136.75 |
| `SUFRAMA` | 2 | 113.96 |

### ICARO

| xNome | CT-e em que aparece | soma vComp |
|---|---|---|
| `Frete peso` | 68 | 29848.80 |
| `Ad Valorem` | 65 | 1595.87 |
| `GRIS` | 65 | 453.20 |
| `ITR` | 65 | 129.00 |
| `Icms` | 65 | 3478.44 |
| `Valor pedagio` | 65 | 281.75 |
| `Taxa adm.` | 10 | 205.02 |
| `SUFRAMA` | 2 | 25.00 |

## B — Conferência soma(vComp) vs vTPrest (tolerância R$ 0,01)

| transportadora | batem | não batem |
|---|---|---|
| 07906565000181 · SJB EXPRESS TRANSPORTES LTDA | 1 | 0 |
| 81560047000705 · ACEVILLE TRANSPORTES LTDA | 1 | 0 |
| BRASPRESS | 18 | 0 |
| ICARO | 68 | 0 |

Nenhuma divergência: todos os CT-e analisados fecham dentro de 1 centavo.

## C — Tomador

| transportadora | toma3 | toma4 | valores de `<toma>` |
|---|---|---|---|
| 07906565000181 · SJB EXPRESS TRANSPORTES LTDA | 1 | 0 | 0×1 |
| 81560047000705 · ACEVILLE TRANSPORTES LTDA | 1 | 0 | 3×1 |
| BRASPRESS | 18 | 0 | 0×18 |
| ICARO | 68 | 0 | 0×66, 1×1, 3×1 |

## D — infCarga

| transportadora | tpMed (frequência) | com `<vCarga>` |
|---|---|---|
| 07906565000181 · SJB EXPRESS TRANSPORTES LTDA | `UNIDADE`×1, `PARES`×1, `M3`×1, `PESO REAL`×1, `PESO BASE DE CALCULO`×1 | 1/1 |
| 81560047000705 · ACEVILLE TRANSPORTES LTDA | `UNIDADE`×1, `PARES`×1, `M3`×1, `PESO REAL`×1, `PESO BASE DE CALCULO`×1 | 1/1 |
| BRASPRESS | `CAIXAS`×18, `PESO CUBADO`×18 | 18/18 |
| ICARO | `Peso real`×68, `Peso cubado`×68, `Peso taxado`×68, `Volumes`×68, `Volume`×68 | 68/68 |

## E — infNFe

| transportadora | 0 | 1 | 2 | >2 |
|---|---|---|---|---|
| 07906565000181 · SJB EXPRESS TRANSPORTES LTDA | 0 | 0 | 0 | 1 |
| 81560047000705 · ACEVILLE TRANSPORTES LTDA | 0 | 1 | 0 | 0 |
| BRASPRESS | 0 | 18 | 0 | 0 |
| ICARO | 0 | 67 | 1 | 0 |

CT-e com mais de uma NF-e:

| transportadora | nCT | chave | qtd infNFe |
|---|---|---|---|
| 07906565000181 · SJB EXPRESS TRANSPORTES LTDA | 30170 | `42260507906565000181570010000301701000225692` | 6 |
| ICARO | 3036041 | `42260506225952000190570010030360411886350314` | 2 |

## F — Impostos

| transportadora | grupos ICMS | com bloco IBSCBS |
|---|---|---|
| 07906565000181 · SJB EXPRESS TRANSPORTES LTDA | `ICMS00`×1 | 1/1 |
| 81560047000705 · ACEVILLE TRANSPORTES LTDA | `ICMS00`×1 | 1/1 |
| BRASPRESS | `ICMS00`×18 | 18/18 |
| ICARO | `ICMS00`×67, `ICMSOutraUF`×1 | 68/68 |

## G — ide

| transportadora | CFOP | tpCTe | natOp |
|---|---|---|---|
| 07906565000181 · SJB EXPRESS TRANSPORTES LTDA | `6353`×1 | `0`×1 | `Transp a est comercial`×1 |
| 81560047000705 · ACEVILLE TRANSPORTES LTDA | `6353`×1 | `0`×1 | `Transp a est comercial`×1 |
| BRASPRESS | `6352`×15, `5352`×2, `6353`×1 | `0`×18 | `TRANSPORTE RODOVIARIO`×18 |
| ICARO | `6352`×65, `5352`×2, `6932`×1 | `0`×68 | `Prestacao de servico de transporte a estabelecimento industr`×67, `Prestacao de servico de transporte iniciado em outra UF`×1 |

## H — Datas `<dhEmi>`

| transportadora | menor dhEmi | maior dhEmi |
|---|---|---|
| 07906565000181 · SJB EXPRESS TRANSPORTES LTDA | 2026-05-09T23:15:45-03:00 | 2026-05-09T23:15:45-03:00 |
| 81560047000705 · ACEVILLE TRANSPORTES LTDA | 2026-07-28T21:18:45-03:00 | 2026-07-28T21:18:45-03:00 |
| BRASPRESS | 2026-07-08T20:51:21-03:00 | 2026-07-31T23:10:06-03:00 |
| ICARO | 2026-05-25T19:02:02-03:00 | 2026-07-13T10:01:25-03:00 |

## I — Caminhos de tag distintos em `vPrest`, `infCarga` e `imp`

| caminho | CT-e em que aparece |
|---|---|
| `/imp` | 88 |
| `/imp/IBSCBS` | 88 |
| `/imp/IBSCBS/CST` | 88 |
| `/imp/IBSCBS/cClassTrib` | 88 |
| `/imp/IBSCBS/gIBSCBS` | 88 |
| `/imp/IBSCBS/gIBSCBS/gCBS` | 88 |
| `/imp/IBSCBS/gIBSCBS/gCBS/pCBS` | 88 |
| `/imp/IBSCBS/gIBSCBS/gCBS/vCBS` | 88 |
| `/imp/IBSCBS/gIBSCBS/gIBSMun` | 88 |
| `/imp/IBSCBS/gIBSCBS/gIBSMun/pIBSMun` | 88 |
| `/imp/IBSCBS/gIBSCBS/gIBSMun/vIBSMun` | 88 |
| `/imp/IBSCBS/gIBSCBS/gIBSUF` | 88 |
| `/imp/IBSCBS/gIBSCBS/gIBSUF/pIBSUF` | 88 |
| `/imp/IBSCBS/gIBSCBS/gIBSUF/vIBSUF` | 88 |
| `/imp/IBSCBS/gIBSCBS/vBC` | 88 |
| `/imp/IBSCBS/gIBSCBS/vIBS` | 88 |
| `/imp/ICMS` | 88 |
| `/imp/ICMS/ICMS00` | 87 |
| `/imp/ICMS/ICMS00/CST` | 87 |
| `/imp/ICMS/ICMS00/pICMS` | 87 |
| `/imp/ICMS/ICMS00/vBC` | 87 |
| `/imp/ICMS/ICMS00/vICMS` | 87 |
| `/imp/ICMS/ICMSOutraUF` | 1 |
| `/imp/ICMS/ICMSOutraUF/CST` | 1 |
| `/imp/ICMS/ICMSOutraUF/pICMSOutraUF` | 1 |
| `/imp/ICMS/ICMSOutraUF/vBCOutraUF` | 1 |
| `/imp/ICMS/ICMSOutraUF/vICMSOutraUF` | 1 |
| `/imp/ICMSUFFim` | 1 |
| `/imp/ICMSUFFim/pFCPUFFim` | 1 |
| `/imp/ICMSUFFim/pICMSInter` | 1 |
| `/imp/ICMSUFFim/pICMSUFFim` | 1 |
| `/imp/ICMSUFFim/vBCUFFim` | 1 |
| `/imp/ICMSUFFim/vFCPUFFim` | 1 |
| `/imp/ICMSUFFim/vICMSUFFim` | 1 |
| `/imp/ICMSUFFim/vICMSUFIni` | 1 |
| `/imp/infAdFisco` | 18 |
| `/imp/vTotDFe` | 88 |
| `/imp/vTotTrib` | 70 |
| `/infCarga` | 88 |
| `/infCarga/infQ` | 88 |
| `/infCarga/infQ/cUnid` | 88 |
| `/infCarga/infQ/qCarga` | 88 |
| `/infCarga/infQ/tpMed` | 88 |
| `/infCarga/proPred` | 88 |
| `/infCarga/vCarga` | 88 |
| `/infCarga/vCargaAverb` | 88 |
| `/vPrest` | 88 |
| `/vPrest/Comp` | 88 |
| `/vPrest/Comp/vComp` | 88 |
| `/vPrest/Comp/xNome` | 88 |
| `/vPrest/vRec` | 88 |
| `/vPrest/vTPrest` | 88 |
