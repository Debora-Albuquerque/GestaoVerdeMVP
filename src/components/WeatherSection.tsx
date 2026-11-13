import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudRain,
  Droplets,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Thermometer,
} from 'lucide-react';
import type { PhytosanitaryAlert, WeatherSnapshot } from '../types';
import {
  evaluatePhytosanitaryRisk,
  fetchMogiWeather,
  MOGI_COORDS,
} from '../utils/agronomy';

interface WeatherSectionProps {
  activeCoords: { latitude: number; longitude: number; label: string };
  onUseCurrentGps: () => void;
  gpsLoading: boolean;
}

export function WeatherSection({
  activeCoords,
  onUseCurrentGps,
  gpsLoading,
}: WeatherSectionProps) {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [alert, setAlert] = useState<PhytosanitaryAlert | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadWeather = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await fetchMogiWeather(
        activeCoords.latitude,
        activeCoords.longitude,
        activeCoords.label
      );
      setWeather(snapshot);
      setAlert(evaluatePhytosanitaryRisk(snapshot));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar a previsão do tempo agora.'
      );
    } finally {
      setLoading(false);
    }
  }, [activeCoords.latitude, activeCoords.longitude, activeCoords.label]);

  useEffect(() => {
    loadWeather();
  }, [loadWeather]);

  const alertStyles =
    alert?.level === 'alto'
      ? 'bg-red-50/90 border-red-200 text-red-950'
      : alert?.level === 'moderado'
        ? 'bg-amber-50/90 border-amber-200 text-amber-950'
        : 'bg-emerald-50/90 border-emerald-200 text-emerald-950';

  const AlertIcon =
    alert?.level === 'alto'
      ? ShieldAlert
      : alert?.level === 'moderado'
        ? AlertTriangle
        : CheckCircle2;

  const alertIconColor =
    alert?.level === 'alto'
      ? 'text-red-700'
      : alert?.level === 'moderado'
        ? 'text-amber-700'
        : 'text-emerald-700';

  return (
    <section
      id="clima"
      aria-labelledby="clima-heading"
      className="scroll-mt-20 bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden"
    >
      {/* Topo compacto da caixa de clima */}
      <div className="p-4 sm:px-5 sm:py-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <h2 id="clima-heading" className="text-base sm:text-lg font-semibold text-slate-900 truncate">
            Previsão e Risco Fitossanitário
          </h2>
          <p className="text-xs text-slate-500 font-mono tabular-nums truncate">
            {activeCoords.label} · {activeCoords.latitude.toFixed(4)}, {activeCoords.longitude.toFixed(4)}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onUseCurrentGps}
            disabled={gpsLoading}
            className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{gpsLoading ? 'GPS...' : 'Meu GPS'}</span>
          </button>
          <button
            type="button"
            onClick={loadWeather}
            disabled={loading}
            aria-label="Atualizar previsão do tempo"
            className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      {/* Corpo unificado: empilhado no celular (grid-cols-1) e 3 colunas em sm+ */}
      <div className="p-4 sm:p-5 space-y-3.5">
        {loading && !weather ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" aria-busy="true">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="h-20 sm:h-28 rounded-xl bg-slate-100 animate-pulse border border-slate-200/60"
              />
            ))}
          </div>
        ) : error && !weather ? (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs sm:text-sm font-medium">{error}</p>
            <button
              type="button"
              onClick={loadWeather}
              className="min-h-[42px] px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              Tentar novamente
            </button>
          </div>
        ) : weather ? (
          <>
            {/* Empilhamento vertical confortável no celular, lado a lado a partir de sm: */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
              {weather.days.map((day, idx) => (
                <div
                  key={day.date}
                  className={`min-w-0 p-3.5 rounded-xl border flex sm:flex-col items-center sm:items-stretch justify-between gap-3 sm:gap-2 ${
                    idx === 0
                      ? 'bg-emerald-950 text-white border-emerald-950'
                      : 'bg-slate-50/70 text-slate-900 border-slate-200/80'
                  }`}
                >
                  <div className="min-w-0 sm:flex sm:items-center sm:justify-between sm:gap-2">
                    <span className="block text-sm font-semibold capitalize truncate">
                      {day.label}
                    </span>
                    <span
                      className={`block text-xs truncate ${
                        idx === 0 ? 'text-emerald-200' : 'text-slate-500'
                      }`}
                    >
                      {day.conditionText}
                    </span>
                  </div>

                  <div className="flex items-center sm:items-baseline justify-end sm:justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-1">
                      <Thermometer
                        className={`w-4 h-4 shrink-0 ${
                          idx === 0 ? 'text-emerald-300' : 'text-emerald-700'
                        }`}
                      />
                      <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums tracking-tight">
                        {idx === 0 ? `${weather.currentTemp}°C` : `${day.tempMax}°C`}
                      </span>
                    </div>

                    <div
                      className={`text-right sm:text-left text-xs font-mono tabular-nums space-y-0.5 ${
                        idx === 0 ? 'text-emerald-200' : 'text-slate-600'
                      }`}
                    >
                      <div className="sm:hidden">
                        {day.tempMin}°/{day.tempMax}°
                      </div>
                      <div className="flex items-center justify-end sm:justify-start gap-2">
                        <span className="inline-flex items-center gap-1">
                          <Droplets className="w-3.5 h-3.5 shrink-0" />
                          {idx === 0 ? weather.currentHumidity : day.humidityMean}%
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CloudRain className="w-3.5 h-3.5 shrink-0" />
                          {day.precipitationProb}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Alerta Fitossanitário Integrado na mesma caixa */}
            {alert && (
              <div className={`p-3.5 rounded-xl border ${alertStyles}`}>
                <div className="flex items-start gap-2.5">
                  <AlertIcon className={`w-5 h-5 shrink-0 mt-0.5 ${alertIconColor}`} />
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-semibold leading-snug">
                      {alert.title}
                    </h3>
                    <p className="text-xs sm:text-sm leading-relaxed opacity-90">
                      {alert.recommendation}
                    </p>
                    <p className="text-[11px] opacity-75 font-mono tabular-nums pt-0.5 break-words">
                      {alert.factors.join(' · ')} · {weather.fetchedAt} · {MOGI_COORDS.label.split('·')[0].trim()}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
