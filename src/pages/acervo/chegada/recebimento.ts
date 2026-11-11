export interface TermoResumo {
 termo_entrada_id:string;numero:string;data_recebimento:string;documento_ref:string|null;porta_codigo:string;porta_rotulo:string;centro_codigo:string;centro_nome:string;ingerido_em:string;
 linhas:number;declarado:number;recebido:number;falta:number;excesso:number;nao_conforme:number;nfs:number;nfs_lista:string|string[]|null;tarefas_abertas:number;email_recebido_em:string|null;email_assunto:string|null;status:string;
}
export interface LinhaTermo { nf_numero:string|null;nf_id:string|null;sku:string;codigo_xpm:string|null;descricao:string|null;qtd_declarada:number;qtd_recebida:number;qtd_falta:number;qtd_excesso:number;qtd_nao_conforme:number;rnc:string|null }
export function divergente(l:LinhaTermo){return !l.nf_id || Number(l.qtd_falta)>0 || Number(l.qtd_excesso)>0 || Number(l.qtd_nao_conforme)>0;}
export function ordenarLinhas(l: LinhaTermo[]){return [...l].sort((a,b)=>Number(divergente(b))-Number(divergente(a)));}
export function somarTermos(termos:TermoResumo[]){return termos.reduce((a,t)=>({termos:a.termos+1,recebido:a.recebido+Number(t.recebido||0),falta:a.falta+Number(t.falta||0),tarefas:a.tarefas+Number(t.tarefas_abertas||0)}),{termos:0,recebido:0,falta:0,tarefas:0});}
export function periodoAtual(){const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const [ano,mes]=hoje.split('-');return {de:`${ano}-${mes}-01`,ate:`${ano}-${mes}-${new Date(Number(ano),Number(mes),0).getDate()}`};}