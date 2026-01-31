import { useState, useEffect } from 'react';
import { Plus, Search, Video, Wifi, WifiOff, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCameraStore, Camera } from '@/store/useCameraStore';
import { useAuditStore } from '@/store/useAuditStore';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/lib/api';
import { useTranslation } from 'react-i18next';

const Cameras = () => {
    const { t } = useTranslation();
    const { cameras, fetchCameras, addCamera, updateCamera, deleteCamera } = useCameraStore();
    const { addLog } = useAuditStore();
    const { user } = useAuthStore();

    useEffect(() => {
        fetchCameras();
    }, []);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newCamera, setNewCamera] = useState<Partial<Camera>>({ name: '', ip: '', location: '', platformId: '1', protocol: 'RTSP', cameraType: 'RTSP' });
    const [isTesting, setIsTesting] = useState<string | null>(null);

    const filteredCameras = cameras.filter((cam: any) =>
        String(cam.name).toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(cam.location).toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSaveCamera = async () => {
        console.log('handleSaveCamera invoked', { editingId, newCamera });
        try {
            // Basic validation: require IP/URL
            if (!newCamera.ip || !String(newCamera.ip).trim()) {
                alert(t('cameras.messages.fillIp'));
                return;
            }

            // Only admin can create or update cameras of type WEBCAM
            const selectedType = (newCamera.protocol || newCamera.cameraType || '').toString();
            if (selectedType === 'WEBCAM' && user?.role !== 'admin') {
                alert(t('cameras.messages.testError', { id: '' }) || 'Only admins can create WEBCAM cameras.');
                return;
            }

            if (editingId) {
                await updateCamera(editingId, { ...newCamera, cameraType: (newCamera.protocol || 'RTSP') as 'RTSP' | 'RTMP' | 'HTTP' | 'ONVIF' | 'WEBCAM' });
                    addLog({
                    userId: user?.id || 'unknown',
                    userName: user?.name || 'Unknown',
                        action: 'Camera Updated',
                        details: `Camera ${newCamera.name} (ID: ${editingId}) updated`,
                    category: 'camera'
                });
                setEditingId(null);
            } else {
                const id = Date.now().toString();
                const response = await addCamera({ ...newCamera, id, status: 'offline', cameraType: (newCamera.protocol || 'RTSP') as 'RTSP' | 'RTMP' | 'HTTP' | 'ONVIF' | 'WEBCAM' } as Camera) as any;

                // Check for duplicate URL warning
                if (response?.warning) {
                    alert(t('cameras.messages.duplicateWarning', { msg: response.warning }));
                }

                    addLog({
                    userId: user?.id || 'unknown',
                    userName: user?.name || 'Unknown',
                    action: 'Camera Created',
                    details: `Camera ${newCamera.name} (ID: ${id}) created${response?.warning ? ' [duplicate URL]' : ''}`,
                    category: 'camera'
                });
            }
            setIsModalOpen(false);
            setNewCamera({ name: '', ip: '', location: '', platformId: '1', protocol: 'RTSP', cameraType: 'RTSP' });
        } catch (err: any) {
            console.error('handleSaveCamera error:', err);
            // If the server returned a JSON response, log and show it to the user for debugging
                    if (err?.response) {
                console.error('handleSaveCamera response data:', err.response.data);
                try {
                    const details = typeof err.response.data === 'object' ? JSON.stringify(err.response.data) : String(err.response.data);
                    alert('Error saving camera: ' + details);
                } catch (e) {
                    alert('Error saving camera: ' + (err?.message || 'unknown'));
                }
                    } else {
                alert(t('cameras.messages.saveError', { msg: (err?.message || err?.toString() || 'unknown') }));
            }
        }
    };

    const handleEditCamera = (camera: Camera) => {
        setNewCamera({ ...camera, protocol: camera.cameraType || 'RTSP' });
        setEditingId(camera.id);
        setIsModalOpen(true);
    };

    const handleDeleteCamera = (id: string) => {
        if (confirm(t('cameras.messages.confirmDelete'))) {
            const cam = cameras.find((c: any) => c.id === id);
            deleteCamera(id);
            addLog({
                userId: user?.id || 'unknown',
                userName: user?.name || 'Unknown',
                    action: 'Camera Deleted',
                    details: `Camera ${cam?.name || id} (ID: ${id}) deleted`,
                category: 'camera'
            });
        }
    };

    const handleTestConnection = async (id: string) => {
        setIsTesting(id);
        try {
            const response = await api.get(`/api/v1/test_connection_plat/${id}`);

                    if (response.data.success) {
                updateCamera(id, { status: 'online' });
                await fetchCameras(); // refresh list/status after backend test
                addLog({
                    userId: user?.id || 'unknown',
                    userName: user?.name || 'Unknown',
                        action: 'Connection Test',
                        details: `Connection test for platform ${id}: Success`,
                    category: 'camera'
                });
                    alert(t('cameras.messages.testSuccess', { id }));
            } else {
                updateCamera(id, { status: 'offline' });
                addLog({
                    userId: user?.id || 'unknown',
                    userName: user?.name || 'Unknown',
                        action: 'Connection Test',
                        details: `Connection test for platform ${id}: Failure - ${response.data.error || 'Timeout'}`,
                    category: 'camera'
                });
                    alert(t('cameras.messages.testFailed', { id, err: response.data.error || 'No signal or timeout' }));
            }
        } catch (error) {
            console.error('Failed to test camera:', error);
                alert(t('cameras.messages.testError', { id }));
        } finally {
            setIsTesting(null);
        }
    };

    const openNewModal = () => {
        setEditingId(null);
        setNewCamera({ name: '', ip: '', location: '', platformId: '1', protocol: 'RTSP', cameraType: 'RTSP' });
        setIsModalOpen(true);
    };

    return (
        <div className="space-y-6 relative">
            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl border border-border">
                        <h2 className="text-xl font-bold text-foreground mb-4">{editingId ? t('cameras.modal.edit') : t('cameras.modal.new')}</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700">{t('cameras.form.name')}</label>
                                <input
                                    type="text"
                                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground"
                                    value={newCamera.name}
                                    onChange={(e) => setNewCamera({ ...newCamera, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">{t('cameras.form.ip')}</label>
                                <input
                                    type="text"
                                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground"
                                    value={newCamera.ip}
                                    onChange={(e) => setNewCamera({ ...newCamera, ip: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">{t('cameras.form.protocol')}</label>
                                    <select
                                        className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground"
                                        value={newCamera.protocol}
                                        onChange={(e) => {
                                            setNewCamera({ ...newCamera, protocol: e.target.value });
                                            // If switching to WEBCAM, set IP to 0
                                            if (e.target.value === 'WEBCAM' && !newCamera.ip) {
                                                setNewCamera(prev => ({ ...prev, ip: '0' }));
                                            }
                                        }}
                                    >
                                        <option value="RTSP">RTSP</option>
                                        <option value="RTMP">RTMP</option>
                                        <option value="HTTP">HTTP</option>
                                        <option value="ONVIF">ONVIF</option>
                                        {user?.role === 'admin' && <option value="WEBCAM">WEBCAM</option>}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">{t('cameras.form.platform')}</label>
                                    <select
                                        className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground"
                                        value={newCamera.platformId}
                                        onChange={(e) => setNewCamera({ ...newCamera, platformId: e.target.value })}
                                        disabled={!!editingId}
                                    >
                                        {(() => {
                                            // If editing, show current platform; otherwise suggest next 4 platforms
                                            if (editingId) {
                                                return [<option key={newCamera.platformId} value={String(newCamera.platformId)}>Platform {newCamera.platformId}</option>];
                                            }
                                            
                                            const platformNums = cameras
                                                                        .map((c: any) => parseInt(String(c.platformId || '0')))
                                                                        .filter((n: any) => !isNaN(n) && n > 0);
                                            const maxN = platformNums.length ? Math.max(...platformNums) : 0;
                                            const start = maxN > 0 ? (maxN + 1) : 1;
                                            const options = [] as JSX.Element[];
                                            for (let i = start; i < start + 4; i++) {
                                                options.push(<option key={i} value={String(i)}>Platform {i}</option>);
                                            }
                                            return options;
                                        })()}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">{t('cameras.form.location')}</label>
                                <input
                                    type="text"
                                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground"
                                    value={newCamera.location}
                                    onChange={(e) => setNewCamera({ ...newCamera, location: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent rounded-lg transition-colors pointer-events-auto"
                                >
                                    {t('cameras.modal.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveCamera}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors pointer-events-auto"
                                >
                                    {editingId ? t('cameras.modal.save') : t('cameras.modal.saveCamera')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('cameras.title')}</h1>
                    <p className="text-muted-foreground">{t('cameras.subtitle')}</p>
                </div>
                <button
                    onClick={openNewModal}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    {t('cameras.actions.new')}
                </button>
            </div>

            <div className="flex items-center rounded-lg border border-border bg-card px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-600">
                <Search className="h-5 w-5 text-gray-400" />
                <input
                    type="text"
                    placeholder={t('cameras.search.placeholder')}
                    className="ml-2 flex-1 border-none bg-transparent outline-none placeholder:text-gray-400"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                    <thead className="bg-secondary/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider align-middle">{t('cameras.table.camera')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider align-middle">{t('cameras.table.ip')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider align-middle">Tipo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider align-middle">{t('cameras.table.location')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider align-middle">{t('cameras.table.status')}</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider align-middle">{t('cameras.table.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                        {filteredCameras.map((cam: any) => (
                            <tr key={cam.id} className="hover:bg-muted/50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="h-10 w-10 flex-shrink-0 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                                            <Video className="h-5 w-5" />
                                        </div>
                                        <div className="ml-4">
                                            <div className="text-sm font-medium text-foreground">{cam.name}</div>
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <span>ID: {cam.id}</span>
                                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">P{cam.platformId}</span>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                                    {cam.ip}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                        {cam.cameraType || 'RTSP'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                                    {cam.location}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={cn(
                                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                                        cam.status === 'online' ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                                    )}>
                                        {cam.status === 'online' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                                        {cam.status === 'online' ? t('cameras.status.online') : t('cameras.status.offline')}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => handleTestConnection(cam.id)}
                                        className="text-slate-500 hover:text-blue-600 mr-4 text-xs border border-slate-200 px-3 py-1.5 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1.5 font-medium"
                                        disabled={isTesting === cam.id}
                                        title={t('cameras.actions.testTitle')}
                                    >
                                        {isTesting === cam.id ? (
                                            <>
                                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                                                {t('cameras.actions.testing')}
                                            </>
                                        ) : (
                                            t('cameras.actions.test')
                                        )}
                                    </button>
                                    <button
                                        onClick={() => handleEditCamera(cam)}
                                        className="text-blue-600 hover:text-blue-900 mr-4"
                                    >
                                        <Edit className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteCamera(cam.id)}
                                        className="text-red-600 hover:text-red-900"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Cameras;
