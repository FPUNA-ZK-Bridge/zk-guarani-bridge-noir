# Guarani Bridge 🌉

Un puente de tokens descentralizado que permite transferir **GuaraniTokens** entre dos cadenas de bloques (L1 ↔ L2) de forma segura y eficiente. Implementa el patrón **lock-and-mint** con protección contra replay attacks y verificación criptográfica.

## ✨ Características Principales

- 🔒 **Lock-and-Mint Pattern**: Los tokens se bloquean en L1 y se acuñan equivalentes en L2
- 🛡️ **Replay Protection**: Previene el procesamiento duplicado de transacciones
- 🤖 **Relayer Automatizado**: Escucha eventos y ejecuta transferencias automáticamente
- 🔍 **Transparencia Total**: Todos los eventos son auditables en ambas cadenas
- 🎯 **Gas Optimizado**: Contratos eficientes con mínimo consumo de gas
- 🧪 **Entorno de Testing**: Configuración completa para desarrollo local

## 🌉 Cómo Funciona

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GUARANI BRIDGE FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

    L1 (Hardhat - Puerto 31337)              L2 (Anvil - Puerto 1338)
    ┌─────────────────────────┐              ┌─────────────────────────┐
    │                         │              │                         │
    │  👤 Usuario             │              │  👤 Usuario (mismo)     │
    │  📦 GuaraniToken        │              │  📦 GuaraniToken        │
    │  🔒 Sender Contract     │              │  🏭 Receiver Contract   │
    │                         │              │                         │
    └─────────────────────────┘              └─────────────────────────┘
              │                                        ▲
              │ 1. lock(amount) 🔒                     │
              │    - Tokens bloqueados                 │
              │    - Emite evento "Locked"             │ 3. mintRemote() 🏭
              │                                        │    - Crea tokens en L2
              │                                        │    - Emite evento "Minted"
              └──────────────────┐                     │
                                 │                     │
                                 ▼                     │
                        ┌─────────────────────┐        │
                        │   🤖 RELAYER        │────────┘
                        │                     │
                        │ 2. Escucha "Locked" │
                        │    Ejecuta mint     │
                        │    en L2            │
                        └─────────────────────┘

Flujo Detallado:
1️⃣ **Preparación**: Usuario aprueba tokens al contrato Sender en L1
2️⃣ **Lock**: Usuario llama lock(recipientL2, amount) → tokens se bloquean
3️⃣ **Evento**: Se emite evento "Locked" con ID único y detalles
4️⃣ **Relayer**: Detecta evento y valida la transacción
5️⃣ **Mint**: Relayer ejecuta mintRemote() en contrato Receiver de L2
6️⃣ **Confirmación**: Se acuñan tokens equivalentes para el destinatario
```

## 🔐 Modo ZK (puente trustless)

El puente tiene **dos modos**, elegidos con `ENABLE_ZK_PROOF_WAY` en `.env`:

- **Clásico** (`false`): el relayer llama a `mintRemote()` y se **confía** en él para acuñar.
- **ZK** (`true`): el relayer adjunta una **prueba de conocimiento cero** y el contrato
  `ReceiverZK.release()` la **verifica on-chain** antes de acuñar. El relayer deja de ser un
  acuñador de confianza y pasa a ser un *probador*: cualquiera con una prueba válida puede
  liberar, pero **nadie puede acuñar sin ella**. Es el núcleo de la tesis: reemplazar
  confianza por verificación criptográfica.

### Flujo ZK

```
[Usuario] ─lock()→ [Sender (N1)] ─emit Locked→ [Relayer]
                                                   │  (arma inputs, corre el circuito)
                                                   ▼
                                          [Noir Engine (off-chain)] → ZK-proof
                                                   │  (proof + inputs públicos)
                                                   ▼
                            [ReceiverZK.release() (N2)] → [TxInclusionVerifier.sol] ✓
                                                   │
                                                   ▼  si la prueba es válida: mint → fondos liberados
```

### ¿Dónde se usa la ZK?

- **Generación — off-chain (relayer):** el circuito Noir compilado + `bb.js` arman la prueba
  (`relayer/prover.js`). Es la parte pesada del ZK.
- **Verificación — on-chain (N2):** `TxInclusionVerifier.sol` (verificador UltraHonk que genera
  `bb`, ~17 KB) valida la prueba dentro de `release()`, que **revierte si no es válida**.

### Qué prueba el circuito

- **Circuito MPT** (`noir-merkle`) — *verificación de transacciones*: demuestra que la tx `lock`
  está **incluida** en un bloque (bajo el `transactionsRoot`). **Es el que corre hoy.**
- **Circuito BLS** (`zk-bridge-zero`) — *verificación de firmas*: demuestra que el sync committee
  de Ethereum **firmó** ese bloque (finalidad). **Fase 4, aún no conectado.**

### Componentes ZK

| Componente | Rol |
|---|---|
| `noir-merkle` (circuito MPT) | Genera el ACIR; prueba inclusión de la tx |
| `relayer/prover.js` | Corre el circuito (NoirJS + bb.js) → `{proof, publicInputs}` |
| `contracts/verifiers/TxInclusionVerifier.sol` | Verificador UltraHonk on-chain (lo genera `bb`) |
| `contracts/RootRegistry.sol` | Registro (temporal) de `transactionsRoot` confiables |
| `contracts/ReceiverZK.sol` | `release()`: verifica la prueba + anti-replay → acuña |
| `relayer/relayer-zk.js` | Escucha `Locked`, obtiene la prueba y llama a `release()` |
| `scripts/generate-verifiers.sh` (`npm run circuits:mpt`) | Genera el verificador + copia el ACIR |

### Estado actual (honesto)

- ✅ **Fases 1–2 — funciona end-to-end, con prueba real de cada lock:** lock en N1 →
  `relayer/buildRawCase.js` arma la MPT proof del bloque real (ya no un fixture) →
  `relayer/prover.js` genera la prueba ZK → **verificación on-chain** → mint en N2. El
  verificador es real (rechaza pruebas adulteradas), con anti-replay.
- ✅ **Fase 3 — binding de `(recipient, amount)` implementado, desplegado y probado en vivo:**
  el circuito (`circuits/fase3/`) ata `(to, amount)` al calldata del `lock()` incluido en el
  bloque; `ReceiverZKBoundBLS` (deploy con `USE_BLS=1`) exige que coincidan con la prueba →
  **no se puede adulterar la transferencia**. Test: `test/ReleaseZKBound.test.js`; demo de
  ataque: `scripts/attackDemo.js`.
- ⏳ **Fase 4 — trustless completo (pendiente):** (1) binding de `to == Sender` (falta parsear
  el `to` de la tx desde el RLP para atarlo también); (2) firma **BLS real** (hoy `sigVerifier`
  es un stub que devuelve `true`) para reemplazar el `RootRegistry` confiable.

> Diseño completo y fases en **`docs/INTEGRACION_ZK.md`**. Arranque y pruebas en **`docs/RUN.md`**.

## 🔧 Componentes Técnicos

### Contratos Inteligentes

- **`GuaraniToken.sol`**: Token ERC20 con funcionalidad de mint/burn y roles
- **`Sender.sol`**: Contrato en L1 que bloquea tokens y emite eventos
- **`Receiver.sol`**: Contrato en L2 que acuña tokens tras verificación
- **`Verifier.sol`**: (Opcional) Verificación criptográfica adicional

### Infraestructura

- **Relayer**: Servicio Node.js que monitorea eventos y ejecuta transferencias
- **Frontend**: Interfaz web para interactuar con el puente
- **Testing**: Suite completa de tests para validar funcionalidad

## 🛡️ Seguridad

- **Nonce System**: Cada transferencia tiene un ID único incremental
- **Replay Protection**: Mapping de transacciones procesadas previene duplicados
- **Role-Based Access**: Solo el relayer autorizado puede acuñar tokens
- **Event Validation**: Verificación completa de eventos antes del procesamiento

## 🚀 Guía de Setup Completa (Desde Cero)

### ⚠️ Importante: Setup Paso a Paso

Para evitar errores comunes como "Contract not found", sigue **exactamente** estos pasos en orden:

### Prerrequisitos

- Node.js v18+
- npm o yarn  
- Docker & Docker Compose (Recomendado)
- MetaMask u otro wallet compatible

### 🐳 Método Recomendado: Docker Compose

#### 1️⃣ Clonar y preparar el proyecto

```bash
git clone <repository-url>
cd guarani-bridge

# Configuración: el .env controla el modo del puente
cp .env.example .env
```

En `.env`, el switch **`ENABLE_ZK_PROOF_WAY`** elige el modo:
- `true`  → flujo **ZK** (`ReceiverZK.release()` verifica una prueba on-chain)
- `false` → flujo **clásico** (`Receiver.mintRemote()`, relayer de confianza)

Solo para el modo **ZK** (una vez, requiere `nargo` + `bb` instalados): generar el
verificador Solidity y el ACIR del circuito. En modo clásico, salteá esto.

```bash
npm run circuits:mpt
```

#### 2️⃣ Levantar servicios base

```bash
# Construir todas las imágenes
docker compose build

# Iniciar L1 (Hardhat) y L2 (Anvil)
docker compose up -d hardhat-n1 anvil-n2

# Verificar que están saludables (IMPORTANTE)
docker compose ps
# Debe mostrar hardhat-n1 como "healthy"
```

#### 3️⃣ Desplegar + generar config (CRÍTICO — un solo comando)

```bash
docker compose run --rm -e USE_BLS=1 deployer bash scripts/docker-deploy.sh
```

`USE_BLS=1` es solo para modo ZK — despliega `ReceiverZKBoundBLS` (Fase 3+4, ata
`(recipient, amount)` a la prueba). Sin esa variable cae a `ReceiverZK` (Fase 1, sin ese
binding). En modo clásico no aplica.

Según `ENABLE_ZK_PROOF_WAY`, este script:
- despliega N1 (GuaraniToken + Sender) y N2 (contratos ZK o Receiver clásico),
- escribe `deploy-N1.json` y `deploy-N2*.json`,
- **regenera `public/config.js`** con las direcciones y el modo (lo que consume el frontend).

> ⚠️ **Cada vez que reinicies las cadenas** (`down`/`up` o `restart` de los nodos) quedan
> vacías: **volvé a correr este comando**. Redepliega y reescribe el config; si no, el
> frontend queda apuntando a contratos inexistentes ("Contract not found").

#### 4️⃣ (Opcional) mintear a otra cuenta

La cuenta #0 (`0xf39F…92266`) ya tiene 1.000.000 GUA en N1 tras el deploy. Si querés usar
otra cuenta en MetaMask, minteale:

```bash
docker compose run --rm -e MINT_TO=0xTU_CUENTA deployer \
  npx hardhat run scripts/mintTo.js --network dockerN1
```

#### 5️⃣ Iniciar servicios adicionales

```bash
# Iniciar el relayer
docker compose up -d relayer

# Iniciar el frontend (opcional)
docker compose up -d frontend

# Verificar que todo esté corriendo
docker compose ps
```

#### 6️⃣ Acceder a la aplicación

- **Frontend**: http://localhost:3000
- **L1 RPC**: http://localhost:8545 
- **L2 RPC**: http://localhost:9545

### 🔧 Configuración de MetaMask

1. Agregar red L1 (Hardhat):
   - **Network Name**: Hardhat Local
   - **RPC URL**: http://localhost:8545
   - **Chain ID**: 31337
   - **Currency Symbol**: ETH

2. Agregar red L2 (Anvil):
   - **Network Name**: Anvil Local  
   - **RPC URL**: http://localhost:9545
   - **Chain ID**: 1338
   - **Currency Symbol**: ETH

3. Importar la cuenta #0 (tiene 1.000.000 GUA en N1 tras el deploy):
   - **Private Key**: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
   - **Dirección**: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`

4. **Tras cada reinicio de cadena**, reseteá el nonce que MetaMask cachea:
   Configuración → Avanzado → **Borrar datos de la pestaña de actividad**. Si no, las
   transacciones fallan con "transacción fallida" aunque tengas saldo. Refrescá la página
   con `Cmd+Shift+R` para tomar el `config.js` nuevo.

### 🎯 Usar el puente (frontend)

En **http://localhost:3000**: conectá MetaMask (cuenta #0, red 31337), poné la **dirección
destino** y el **monto**, y tocá **Bridge**. El `lock` ocurre en N1; el relayer detecta el
evento, y en **modo ZK** genera la prueba y llama a `release()` (el verificador la valida
on-chain) mientras en **modo clásico** acuña con `mintRemote()`. El badge arriba (🔒 ZK /
🤝 clásico) indica el modo activo, y vas a ver el evento de N2 (`Released`/`Minted`) en el log.

### 🚨 Troubleshooting Común

#### Problema: "Contract not found" en el frontend

**Causa**: Los contratos no están desplegados o los servicios se reiniciaron.

**Solución**:
```bash
# 1. Verificar que los servicios estén corriendo
docker compose ps

# 2. Redesplegar (usa el script que respeta ENABLE_ZK_PROOF_WAY, no los deploy
#    scripts sueltos — esos ignoran el modo y pueden desplegar el receiver
#    equivocado)
docker compose run --rm -e USE_BLS=1 deployer bash scripts/docker-deploy.sh

# 3. Reiniciar relayer y frontend
docker compose restart relayer frontend
```

#### Problema: "Internal JSON-RPC error" en transacciones

**Causa**: Problemas de nonce o falta de tokens.

**Solución**:
```bash
# Mintear tokens a tu cuenta
docker compose run --rm deployer node scripts/mintToFrontendAccount.js
```

#### Problema: Relayer no procesa eventos

**Causa**: Error en el listener de eventos.

**Solución**:
```bash
# Ver logs del relayer
docker logs guarani-relayer --tail 20

# Reiniciar relayer
docker compose restart relayer
```

### ⚡ Reset Completo (cuando algo sale mal)

```bash
# Detener todo y limpiar volúmenes
docker compose down -v

# Reconstruir imágenes
docker compose build --no-cache

# Volver a empezar desde el paso 2
docker compose up -d hardhat-n1 anvil-n2
# ... continuar con los pasos de deploy
```

## 🚀 Instalación Alternativa (Sin Docker)

### Prerrequisitos

- Node.js v18+
- npm o yarn
- MetaMask u otro wallet compatible

### 1️⃣ Instalar dependencias

```bash
npm install
```

### 2️⃣ Arrancar cadenas locales

Necesitas **dos terminales** para ejecutar ambas cadenas:

```bash
# Terminal 1 - L1 (Hardhat)
npm run node:n1   # Puerto 31337

# Terminal 2 - L2 (Anvil)
npm run node:n2   # Puerto 1338
```

### 3️⃣ Compilar y desplegar contratos

```bash
npm run compile      # Compila todos los contratos
npm run deploy:n1    # Despliega en L1 (Hardhat)
npm run deploy:n2    # Despliega en L2 (Anvil)
```

Los archivos `deploy-N1.json` y `deploy-N2.json` contendrán las direcciones de los contratos desplegados.

### 4️⃣ Configurar Frontend

`public/config.js` (lo que lee el frontend) se **autogenera** — no se edita a mano:

```bash
npm run config       # genera public/config.js desde deploy-N1.json/deploy-N2*.json
npm run frontend     # Abre http://localhost:3000
```

### 5️⃣ Iniciar Relayer

```bash
npm run relayer      # Inicia el servicio de relaying
```

## 🐳 Información Adicional de Docker

### Requisitos

- Docker 20.10+
- Docker Compose 2.0+

### Detalles de la Arquitectura

Docker Compose gestiona automáticamente:
- **L1 (Hardhat)**: Red local en puerto 8545
- **L2 (Anvil)**: Red local en puerto 9545
- **Relayer**: Servicio que sincroniza ambas redes
- **Frontend**: Interfaz web en puerto 3000

### Configuración Avanzada

#### Variables de Entorno

Puedes personalizar el comportamiento creando un archivo `.env`:

```bash
# .env
RPC_URL_N1=http://hardhat-n1:8545
RPC_URL_N2=http://anvil-n2:9545
START_BLOCK_N1=0
NODE_OPTIONS=--max-old-space-size=2048
```

### Comandos Útiles para Desarrollo

```bash
# Ver estado de todos los servicios
docker compose ps

# Ver logs en tiempo real
docker compose logs -f

# Logs de un servicio específico
docker compose logs -f hardhat-n1
docker compose logs -f anvil-n2
docker compose logs -f relayer

# Verificar que los contratos existen
curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_getCode","params":["DIRECCION_CONTRATO","latest"],"id":1}' http://localhost:8545

# Ejecutar comando en un contenedor
docker compose exec hardhat-n1 bash

# Mintear tokens de prueba
docker compose run --rm deployer npx hardhat run scripts/mintTokens.js --network dockerN1

# Detener servicios
docker compose stop

# Detener y eliminar (limpia volúmenes)
docker compose down -v

# Reconstruir imágenes (después de cambios)
docker compose build --no-cache

# Reset completo del proyecto
docker compose down -v && docker compose build --no-cache && docker compose up -d
```

### Verificación del Deployment

Después de seguir los pasos, verifica que todo funcione:

```bash
# 1. Verificar servicios activos
docker compose ps
# Debe mostrar: hardhat-n1 (healthy), anvil-n2 (running), relayer (running), frontend (running)

# 2. Verificar archivos de deploy
cat deploy-N1.json
cat deploy-N2.json
# Deben contener direcciones de contratos

# 3. Verificar contratos en L1
curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_getCode","params":["$(cat deploy-N1.json | jq -r .token)","latest"],"id":1}' http://localhost:8545 | jq -r .result
# Debe devolver código del contrato (no "0x")

# 4. Probar el frontend
# Ir a http://localhost:3000
# Las tablas deben mostrar balances de ETH (no "Contract not found")
```

### Archivos Docker

- **`Dockerfile`**: Imagen base con Node.js, dependencias y contratos compilados
- **`Dockerfile.anvil`**: Imagen con Foundry/Anvil para L2
- **`docker-compose.yml`**: Orquestación de servicios y networking
- **`.dockerignore`**: Archivos excluidos del build

## 💡 Uso

### ⚠️ Antes de usar, asegúrate de:

1. ✅ Haber seguido la "Guía de Setup Completa" anterior
2. ✅ Todos los servicios Docker estén corriendo
3. ✅ Los contratos estén desplegados (deploy-N1.json y deploy-N2.json existen)
4. ✅ El relayer esté activo y sin errores

### Via Frontend Web

1. **Abre**: http://localhost:3000
2. **Conecta MetaMask** a la red L1 (Hardhat - puerto 8545, Chain ID 31337)
3. **Importa una cuenta con tokens** (usa la private key proporcionada arriba)
4. **Verifica** que las tablas muestren balances (no "Contract not found")
5. **Ingresa** la dirección de destino en L2
6. **Especifica** la cantidad de tokens a transferir
7. **Haz clic** en "BRIDGE →"
8. **Confirma** en MetaMask
9. **Espera** que el relayer procese automáticamente la transferencia

### Via Scripts

No hay un alias `npm run script`; se corren con `hardhat run` directo, indicando la red
(`localN1`/`localN2` en local, `dockerN1`/`dockerN2` dentro de Docker):

```bash
# Mintear tokens iniciales
npx hardhat run scripts/mintTokens.js --network localN1

# Aprobar tokens al contrato Sender
npx hardhat run scripts/approveTokens.js --network localN1

# Bloquear tokens en L1
npx hardhat run scripts/lockTokens.js --network localN1

# Verificar balances
npx hardhat run scripts/checkBalance.js --network localN1
```

## 🧪 Testing

Necesitan N1 y N2 corriendo (Docker o `npm run node:n1`/`node:n2`) con los contratos ya
desplegados — no son unitarios en un chain efímero, verifican el deploy real.

```bash
# Ejecutar todos los tests (Bridge + Infrastructure + NetworkDiagnostic + ZK)
npm test

# Tests específicos
npm run test:bridge        # Tests del puente (lock/mint/replay, self-contenido)
npm run test:infra         # Tests de infraestructura (contra deploy-N1.json/deploy-N2*.json reales)
npm run test:diagnostic    # Diagnósticos de red (conectividad N1/N2, .env)
npm run test:release       # Tests ZK (ReceiverZK, no necesita N1/N2 corriendo)
```

## 📁 Estructura del Proyecto

```
guarani-bridge/
├── contracts/           # Contratos Solidity
├── scripts/            # Scripts de deployment y utilidades
├── test/              # Suite de tests
├── relayer/           # Servicio relayer
├── public/            # Frontend web
├── utils/             # Utilidades compartidas
└── artifacts/         # Contratos compilados
```
