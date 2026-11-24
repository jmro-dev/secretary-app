const medicalFileController = require('../medical/medicalFileController');
const medicalFileService = require('../../services/medical/MedicalFileService');

jest.mock('../../services/medical/MedicalFileService');

describe('medicalFileController - uploadAudioNote', () => {
    let req, res;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            file: {
                filename: 'audio-123456.m4a',
                originalname: 'consulta-paciente.m4a',
                mimetype: 'audio/m4a',
            },
            body: {
                patientId: 10,
                appointmentId: 55,
                description: 'Dictado de sesión',
            },
            user: { user_id: 1, role: 'doctor' },
            doctorId: 10,
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
    });

    test('debe retornar 400 si no se adjunta archivo de audio', async () => {
        req.file = undefined;
        await medicalFileController.uploadAudioNote(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false, message: expect.stringContaining('archivo de audio') })
        );
    });

    test('debe retornar 400 si falta el patientId', async () => {
        req.body.patientId = undefined;
        await medicalFileController.uploadAudioNote(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false, message: expect.stringContaining('patientId') })
        );
    });

    test('debe guardar la nota de audio y retornar 201 exitoso', async () => {
        const mockSavedResult = {
            id: 101,
            patient_id: 10,
            appointment_id: 55,
            file_name: 'consulta-paciente.m4a',
            file_url: '/uploads/audio_notes/audio-123456.m4a',
            file_type: 'audio/m4a',
            description: 'Dictado de sesión (Consulta #55)',
        };
        medicalFileService.uploadAudioNote.mockResolvedValue(mockSavedResult);

        await medicalFileController.uploadAudioNote(req, res);

        expect(medicalFileService.uploadAudioNote).toHaveBeenCalledWith(req, req);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: 'Nota de audio guardada correctamente',
            data: mockSavedResult,
        });
    });

    test('debe capturar errores y retornar 500 si falla el servicio', async () => {
        medicalFileService.uploadAudioNote.mockRejectedValue(new Error('DB failure'));

        await medicalFileController.uploadAudioNote(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false, message: expect.stringContaining('Error interno') })
        );
    });
});
