package expo.modules.pgssavedgames

import android.app.Activity
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.games.GamesClientStatusCodes
import com.google.android.gms.games.PlayGames
import com.google.android.gms.games.PlayGamesSdk
import com.google.android.gms.games.SnapshotsClient
import com.google.android.gms.games.snapshot.SnapshotMetadata
import com.google.android.gms.games.snapshot.SnapshotMetadataChange
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

// =========================================================
// SAVED GAMES (SNAPSHOTS) DE PLAY GAMES SERVICES
// =========================================================
// Envoltorio mínimo sobre SnapshotsClient. Trabaja con RUTAS de fichero, no con
// bytes: el progreso son cientos de KB y pasarlos por el puente en base64
// costaría un tercio más de memoria y un par de copias del array para nada.
//
// El resumen del progreso viaja en dos huecos que la propia API ya ofrece:
//   progressValue -> número de intentos, que es lo que decide quién va por
//                    delante, y lo que Play Games usa para resolver conflictos
//   description   -> JSON compacto con el resto (ELO, aciertos, puzles)
// Con eso, saber qué hay en la nube no obliga a descargar la partida entera.

private const val CONFLICT_POLICY = SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED

class PgsSavedGamesModule : Module() {

  private val activity: Activity
    get() = appContext.activityProvider?.currentActivity
      ?: throw CodedException("ERR_NO_ACTIVITY", "No hay actividad en primer plano", null)

  private fun metaToMap(meta: SnapshotMetadata?): Map<String, Any?>? {
    if (meta == null) return null
    return mapOf(
      "savedAt" to meta.lastModifiedTimestamp,
      "progress" to meta.progressValue,
      "description" to (meta.description ?: ""),
    )
  }

  override fun definition() = ModuleDefinition {
    Name("PgsSavedGames")

    OnCreate {
      // Idempotente: el SDK ignora las llamadas repetidas. Sin esto, el inicio
      // de sesión automático del arranque no llega a dispararse.
      appContext.reactContext?.let { PlayGamesSdk.initialize(it) }
    }

    // El SDK v2 intenta el login solo al arrancar el juego; esto solo consulta
    // el resultado, sin enseñar nada al usuario.
    AsyncFunction("isAuthenticated") { promise: Promise ->
      PlayGames.getGamesSignInClient(activity).isAuthenticated
        .addOnCompleteListener { task ->
          promise.resolve(task.isSuccessful && task.result.isAuthenticated)
        }
    }

    // Solo para cuando el automático no cuajó: es el botón manual.
    AsyncFunction("signIn") { promise: Promise ->
      PlayGames.getGamesSignInClient(activity).signIn()
        .addOnCompleteListener { task ->
          promise.resolve(task.isSuccessful && task.result.isAuthenticated)
        }
    }

    AsyncFunction("getPlayerName") { promise: Promise ->
      PlayGames.getPlayersClient(activity).currentPlayer
        .addOnSuccessListener { player -> promise.resolve(player.displayName) }
        .addOnFailureListener { promise.resolve(null) }
    }

    // Metadatos sin descargar la partida: load() lista, open() bajaría el fichero.
    AsyncFunction("describe") { name: String, promise: Promise ->
      PlayGames.getSnapshotsClient(activity).load(false)
        .addOnSuccessListener { annotated ->
          val buffer = annotated.get()
          var found: Map<String, Any?>? = null
          try {
            if (buffer != null) {
              for (meta in buffer) {
                if (meta.uniqueName == name) {
                  // Copiado ANTES de soltar el buffer: después, los objetos que
                  // devuelve quedan inservibles.
                  found = metaToMap(meta)
                  break
                }
              }
            }
          } finally {
            buffer?.release()
          }
          promise.resolve(found)
        }
        .addOnFailureListener { error ->
          promise.reject(CodedException("ERR_PGS_DESCRIBE", error.message ?: "", error))
        }
    }

    AsyncFunction("save") { name: String, path: String, description: String, progress: Double, promise: Promise ->
      val client = PlayGames.getSnapshotsClient(activity)
      val file = File(path)
      if (!file.exists()) {
        promise.reject(CodedException("ERR_NO_FILE", "No existe $path", null))
        return@AsyncFunction
      }

      client.maxDataSize
        .addOnSuccessListener { maxSize ->
          if (file.length() > maxSize) {
            // Saved Games tiene un tope por partida guardada. Se avisa con un
            // código propio para que la capa de JS pueda caer a otro transporte
            // en vez de dejar al jugador sin copia.
            promise.reject(
              CodedException("ERR_TOO_BIG", "El progreso supera el máximo de $maxSize bytes", null)
            )
            return@addOnSuccessListener
          }

          client.open(name, true, CONFLICT_POLICY)
            .addOnSuccessListener { result ->
              val snapshot = result.data
              if (snapshot == null) {
                promise.reject(CodedException("ERR_CONFLICT", "Conflicto sin resolver", null))
                return@addOnSuccessListener
              }
              try {
                snapshot.snapshotContents.writeBytes(file.readBytes())
                val change = SnapshotMetadataChange.Builder()
                  .setDescription(description)
                  .setProgressValue(progress.toLong())
                  .build()
                client.commitAndClose(snapshot, change)
                  .addOnSuccessListener { meta -> promise.resolve(metaToMap(meta)) }
                  .addOnFailureListener { error ->
                    promise.reject(CodedException("ERR_PGS_COMMIT", error.message ?: "", error))
                  }
              } catch (error: Exception) {
                promise.reject(CodedException("ERR_PGS_WRITE", error.message ?: "", error))
              }
            }
            .addOnFailureListener { error ->
              promise.reject(CodedException("ERR_PGS_OPEN", error.message ?: "", error))
            }
        }
        .addOnFailureListener { error ->
          promise.reject(CodedException("ERR_PGS_MAXSIZE", error.message ?: "", error))
        }
    }

    // Devuelve null si esta cuenta todavía no tiene partida guardada; cualquier
    // otro fallo sí sube como error, que no es lo mismo "no hay nada" que "no se
    // ha podido leer".
    AsyncFunction("load") { name: String, path: String, promise: Promise ->
      val client = PlayGames.getSnapshotsClient(activity)
      client.open(name, false, CONFLICT_POLICY)
        .addOnSuccessListener { result ->
          val snapshot = result.data
          if (snapshot == null) {
            promise.resolve(null)
            return@addOnSuccessListener
          }
          try {
            val bytes = snapshot.snapshotContents.readFully()
            val meta = metaToMap(snapshot.metadata)
            File(path).writeBytes(bytes)
            client.discardAndClose(snapshot)
            promise.resolve(meta)
          } catch (error: Exception) {
            promise.reject(CodedException("ERR_PGS_READ", error.message ?: "", error))
          }
        }
        .addOnFailureListener { error ->
          val notFound = error is ApiException &&
            error.statusCode == GamesClientStatusCodes.SNAPSHOT_NOT_FOUND
          if (notFound) promise.resolve(null)
          else promise.reject(CodedException("ERR_PGS_OPEN", error.message ?: "", error))
        }
    }

    AsyncFunction("remove") { name: String, promise: Promise ->
      val client = PlayGames.getSnapshotsClient(activity)
      client.load(false)
        .addOnSuccessListener { annotated ->
          val buffer = annotated.get()
          var target: SnapshotMetadata? = null
          try {
            if (buffer != null) {
              for (meta in buffer) {
                if (meta.uniqueName == name) {
                  target = meta.freeze()
                  break
                }
              }
            }
          } finally {
            buffer?.release()
          }

          val metadata = target
          if (metadata == null) {
            promise.resolve(null)
            return@addOnSuccessListener
          }
          client.delete(metadata)
            .addOnSuccessListener { promise.resolve(null) }
            .addOnFailureListener { error ->
              promise.reject(CodedException("ERR_PGS_DELETE", error.message ?: "", error))
            }
        }
        .addOnFailureListener { error ->
          promise.reject(CodedException("ERR_PGS_LIST", error.message ?: "", error))
        }
    }
  }
}
